import { describe, expect, it } from "vitest";
import { createColumn, createId } from "@rdbms-erd/core";
import { createDesignerStore } from "./createDesignerStore";
import {
    filterFkPlanRowsForRenameDialog,
    filterOutBoundFkRenameRows,
    findReusableFkColumn,
    isPkFkPairAlreadyRelated,
    planForeignKeyColumns,
    fkPlanNeedsRenameDialog,
} from "./fkColumnPlan";

/**
 * applyForeignKeyBatch와 동일한 결정 규칙으로 두 번째 A→B 연결을 시뮬레이션한다.
 */
function simulateApplyForeignKeyBatch(
    useStore: ReturnType<typeof createDesignerStore>,
    sourceTableId: string,
    targetTableId: string,
    nameOverrides: Map<
        string,
        { logicalName: string; physicalName: string }
    > | null,
) {
    const latestDoc = useStore.getState().doc;
    const sourceTable = latestDoc.model.tables.find(
        (t) => t.id === sourceTableId,
    )!;
    const targetTable = latestDoc.model.tables.find(
        (t) => t.id === targetTableId,
    )!;
    const sourceColumns = sourceTable.columns.filter((c) => c.isPrimaryKey);
    let nextTargetColumns = [...targetTable.columns];
    let targetColumnsTouched = false;
    const relationshipsToAdd: Array<{
        sourceColumnId: string;
        targetColumnId: string;
    }> = [];

    for (const sourceColumn of sourceColumns) {
        const existingFkColumn = findReusableFkColumn(
            nextTargetColumns,
            latestDoc.model.relationships,
            sourceTableId,
            targetTableId,
            sourceColumn.id,
        );
        let targetColumnId: string;
        if (existingFkColumn) {
            targetColumnId = existingFkColumn.id;
        } else {
            const nm = nameOverrides?.get(sourceColumn.id) ?? {
                logicalName: sourceColumn.logicalName,
                physicalName: sourceColumn.physicalName,
            };
            const physKey = nm.physicalName.trim();
            const samePhysIdx = nextTargetColumns.findIndex(
                (c) => c.physicalName.trim() === physKey,
            );
            const samePhysCol =
                samePhysIdx >= 0 ? nextTargetColumns[samePhysIdx]! : undefined;
            const samePhysAlreadyBound =
                samePhysCol !== undefined &&
                isPkFkPairAlreadyRelated(
                    latestDoc.model.relationships,
                    sourceTableId,
                    targetTableId,
                    sourceColumn.id,
                    samePhysCol.id,
                );
            if (samePhysCol && !samePhysAlreadyBound) {
                nextTargetColumns = [...nextTargetColumns];
                nextTargetColumns[samePhysIdx] = {
                    ...samePhysCol,
                    logicalName: nm.logicalName,
                    physicalName: nm.physicalName,
                    logicalType: sourceColumn.logicalType,
                    nullable: true,
                    isForeignKey: true,
                    referencesPrimaryColumnId: sourceColumn.id,
                };
                targetColumnId = samePhysCol.id;
                targetColumnsTouched = true;
            } else if (samePhysAlreadyBound) {
                continue;
            } else {
                const fkColumn = createColumn("postgres", {
                    id: createId("col"),
                    logicalName: nm.logicalName,
                    physicalName: nm.physicalName,
                    logicalType: sourceColumn.logicalType,
                    nullable: true,
                    isForeignKey: true,
                    referencesPrimaryColumnId: sourceColumn.id,
                });
                nextTargetColumns = [...nextTargetColumns, fkColumn];
                targetColumnId = fkColumn.id;
                targetColumnsTouched = true;
            }
        }
        if (
            !isPkFkPairAlreadyRelated(
                latestDoc.model.relationships,
                sourceTableId,
                targetTableId,
                sourceColumn.id,
                targetColumnId,
            )
        ) {
            relationshipsToAdd.push({
                sourceColumnId: sourceColumn.id,
                targetColumnId,
            });
        }
    }
    if (targetColumnsTouched) {
        useStore.getState().setTableColumns(targetTableId, nextTargetColumns);
    }
    for (const rel of relationshipsToAdd) {
        useStore.getState().addRelationship({
            id: createId("rel"),
            sourceTableId,
            targetTableId,
            sourceColumnId: rel.sourceColumnId,
            targetColumnId: rel.targetColumnId,
            autoCreatedTargetColumn: true,
            originPkColumnId: rel.sourceColumnId,
        });
    }
}

describe("second parent-child relationship", () => {
    it("adds a second FK column and relationship when renamed", () => {
        const useStore = createDesignerStore({ initialDialect: "postgres" });
        useStore.getState().addTable(
            {
                id: "parent",
                logicalName: "Parent",
                physicalName: "parent",
                columns: [
                    createColumn("postgres", {
                        id: "pk1",
                        logicalName: "id",
                        physicalName: "id",
                        logicalType: "NUMBER",
                        nullable: false,
                        isPrimaryKey: true,
                    }),
                ],
            },
            0,
            0,
        );
        useStore.getState().addTable(
            {
                id: "child",
                logicalName: "Child",
                physicalName: "child",
                columns: [
                    createColumn("postgres", {
                        id: "c_pk",
                        logicalName: "id",
                        physicalName: "id",
                        logicalType: "NUMBER",
                        nullable: false,
                        isPrimaryKey: true,
                    }),
                ],
            },
            200,
            0,
        );

        // 첫 연결
        simulateApplyForeignKeyBatch(useStore, "parent", "child", null);
        expect(useStore.getState().doc.model.relationships).toHaveLength(1);
        const afterFirst = useStore
            .getState()
            .doc.model.tables.find((t) => t.id === "child")!;
        expect(
            afterFirst.columns.filter((c) => c.isForeignKey),
        ).toHaveLength(1);

        // 재연결: 동명이면 대화상자 필요; 확정 시 미변경이면 제외
        const source = useStore
            .getState()
            .doc.model.tables.find((t) => t.id === "parent")!;
        const target = useStore
            .getState()
            .doc.model.tables.find((t) => t.id === "child")!;
        const relsAfterFirst = useStore.getState().doc.model.relationships;
        const planned = planForeignKeyColumns(
            source,
            target,
            source.columns.filter((c) => c.isPrimaryKey),
            relsAfterFirst,
        );
        expect(planned[0]?.reuseExisting).toBeNull();
        expect(fkPlanNeedsRenameDialog(planned, target.columns)).toBe(true);
        expect(
            filterFkPlanRowsForRenameDialog(planned, target.columns),
        ).toHaveLength(1);

        // 같은 이름 유지 → 확정 필터에서 제외(no-op)
        expect(
            filterOutBoundFkRenameRows(
                [
                    {
                        sourceColumnId: "pk1",
                        logicalName: "id",
                        physicalName: "id",
                    },
                ],
                target.columns,
                relsAfterFirst,
                "parent",
                "child",
            ),
        ).toEqual([]);

        // 다른 이름으로 두 번째 연결
        const map = new Map([
            [
                "pk1",
                { logicalName: "created_by", physicalName: "created_by" },
            ],
        ]);
        simulateApplyForeignKeyBatch(useStore, "parent", "child", map);

        const rels = useStore.getState().doc.model.relationships;
        expect(rels).toHaveLength(2);
        const child = useStore
            .getState()
            .doc.model.tables.find((t) => t.id === "child")!;
        const fks = child.columns.filter((c) => c.isForeignKey);
        expect(fks).toHaveLength(2);
        expect(fks.map((c) => c.physicalName).sort()).toEqual([
            "created_by",
            "id",
        ]);
        expect(rels[0]!.targetColumnId).not.toBe(rels[1]!.targetColumnId);
        expect(rels.every((r) => r.sourceColumnId === "pk1")).toBe(true);
    });

    it("no-ops when second connect keeps bound FK physical name", () => {
        const useStore = createDesignerStore({ initialDialect: "postgres" });
        useStore.getState().addTable(
            {
                id: "parent",
                logicalName: "Parent",
                physicalName: "parent",
                columns: [
                    createColumn("postgres", {
                        id: "pk1",
                        logicalName: "id",
                        physicalName: "id",
                        logicalType: "NUMBER",
                        nullable: false,
                        isPrimaryKey: true,
                    }),
                ],
            },
            0,
            0,
        );
        useStore.getState().addTable(
            {
                id: "child",
                logicalName: "Child",
                physicalName: "child",
                columns: [],
            },
            200,
            0,
        );
        simulateApplyForeignKeyBatch(useStore, "parent", "child", null);
        expect(useStore.getState().doc.model.relationships).toHaveLength(1);

        // 대화상자 검증을 우회해 같은 이름으로 apply하면 안전망으로 skip
        simulateApplyForeignKeyBatch(
            useStore,
            "parent",
            "child",
            new Map([["pk1", { logicalName: "id", physicalName: "id" }]]),
        );
        expect(useStore.getState().doc.model.relationships).toHaveLength(1);
        const child = useStore
            .getState()
            .doc.model.tables.find((t) => t.id === "child")!;
        expect(child.columns.filter((c) => c.isForeignKey)).toHaveLength(1);
    });

    it("composite PK: confirm with empty applyRows still adds unbound PK FK", () => {
        // 부모 복합 PK 일부는 동명으로 이미 연결, 일부(MoldLocationCode)는 타깃에 물리명 없음
        const useStore = createDesignerStore({ initialDialect: "postgres" });
        useStore.getState().addTable(
            {
                id: "parent",
                logicalName: "STB_MoldLocationInfo",
                physicalName: "STB_MoldLocationInfo",
                columns: [
                    createColumn("postgres", {
                        id: "pk_sys",
                        logicalName: "SystemCode",
                        physicalName: "SystemCode",
                        logicalType: "STRING",
                        nullable: false,
                        isPrimaryKey: true,
                    }),
                    createColumn("postgres", {
                        id: "pk_co",
                        logicalName: "CompanyCode",
                        physicalName: "CompanyCode",
                        logicalType: "STRING",
                        nullable: false,
                        isPrimaryKey: true,
                    }),
                    createColumn("postgres", {
                        id: "pk_loc",
                        logicalName: "MoldLocationCode",
                        physicalName: "MoldLocationCode",
                        logicalType: "STRING",
                        nullable: false,
                        isPrimaryKey: true,
                    }),
                ],
            },
            0,
            0,
        );
        useStore.getState().addTable(
            {
                id: "child",
                logicalName: "STB_MoldMoveHistory",
                physicalName: "STB_MoldMoveHistory",
                columns: [
                    createColumn("postgres", {
                        id: "fk_sys",
                        logicalName: "SystemCode",
                        physicalName: "SystemCode",
                        logicalType: "STRING",
                        nullable: true,
                        isForeignKey: true,
                        referencesPrimaryColumnId: "pk_sys",
                    }),
                    createColumn("postgres", {
                        id: "fk_co",
                        logicalName: "CompanyCode",
                        physicalName: "CompanyCode",
                        logicalType: "STRING",
                        nullable: true,
                        isForeignKey: true,
                        referencesPrimaryColumnId: "pk_co",
                    }),
                    createColumn("postgres", {
                        id: "fk_dest",
                        logicalName: "DestMoldLocationCode",
                        physicalName: "DestMoldLocationCode",
                        logicalType: "STRING",
                        nullable: true,
                        isForeignKey: true,
                        referencesPrimaryColumnId: "pk_loc",
                    }),
                ],
            },
            200,
            0,
        );
        for (const [src, tgt] of [
            ["pk_sys", "fk_sys"],
            ["pk_co", "fk_co"],
            ["pk_loc", "fk_dest"],
        ] as const) {
            useStore.getState().addRelationship({
                id: createId("rel"),
                sourceTableId: "parent",
                targetTableId: "child",
                sourceColumnId: src,
                targetColumnId: tgt,
                autoCreatedTargetColumn: true,
                originPkColumnId: src,
            });
        }
        expect(useStore.getState().doc.model.relationships).toHaveLength(3);

        const source = useStore
            .getState()
            .doc.model.tables.find((t) => t.id === "parent")!;
        const target = useStore
            .getState()
            .doc.model.tables.find((t) => t.id === "child")!;
        const rels = useStore.getState().doc.model.relationships;
        const planned = planForeignKeyColumns(
            source,
            target,
            source.columns.filter((c) => c.isPrimaryKey),
            rels,
        );
        // 대화상자에는 동명 충돌(SystemCode, CompanyCode)만
        const dialogRows = filterFkPlanRowsForRenameDialog(
            planned,
            target.columns,
        );
        expect(
            dialogRows.map((r) => r.proposedPhysical).sort(),
        ).toEqual(["CompanyCode", "SystemCode"]);
        expect(fkPlanNeedsRenameDialog(planned, target.columns)).toBe(true);

        // 확정 시 동명 유지 → applyRows 전부 제외 (MoldLocationCode는 대화상자에 없음)
        const applyRows = filterOutBoundFkRenameRows(
            dialogRows.map((r) => ({
                sourceColumnId: r.sourceColumn.id,
                logicalName: r.proposedLogical,
                physicalName: r.proposedPhysical,
            })),
            target.columns,
            rels,
            "parent",
            "child",
        );
        expect(applyRows).toEqual([]);

        // finalize처럼 override 없이 전체 PK batch → MoldLocationCode 새 FK
        simulateApplyForeignKeyBatch(useStore, "parent", "child", null);

        const after = useStore.getState().doc;
        expect(after.model.relationships).toHaveLength(4);
        const child = after.model.tables.find((t) => t.id === "child")!;
        const moldFk = child.columns.find(
            (c) => c.physicalName === "MoldLocationCode",
        );
        expect(moldFk?.isForeignKey).toBe(true);
        expect(moldFk?.referencesPrimaryColumnId).toBe("pk_loc");
        expect(
            after.model.relationships.some(
                (r) =>
                    r.sourceColumnId === "pk_loc" &&
                    r.targetColumnId === moldFk!.id,
            ),
        ).toBe(true);
        // 기존 DestMoldLocationCode 연결은 유지
        expect(
            after.model.relationships.some(
                (r) =>
                    r.sourceColumnId === "pk_loc" &&
                    r.targetColumnId === "fk_dest",
            ),
        ).toBe(true);
    });
});
