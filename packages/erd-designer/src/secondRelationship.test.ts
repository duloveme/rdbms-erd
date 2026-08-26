import { describe, expect, it } from "vitest";
import { createColumn, createId } from "@rdbms-erd/core";
import { createDesignerStore } from "./createDesignerStore";
import {
    findReusableFkColumn,
    isPkFkPairAlreadyRelated,
    planForeignKeyColumns,
    fkPlanNeedsRenameDialog,
    validateFkRenameRows,
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

        // 재연결 계획: 이미 묶인 FK는 재사용하지 않음 → 이름 충돌 대화상자 필요
        const source = useStore
            .getState()
            .doc.model.tables.find((t) => t.id === "parent")!;
        const target = useStore
            .getState()
            .doc.model.tables.find((t) => t.id === "child")!;
        const planned = planForeignKeyColumns(
            source,
            target,
            source.columns.filter((c) => c.isPrimaryKey),
            useStore.getState().doc.model.relationships,
        );
        expect(planned[0]?.reuseExisting).toBeNull();
        expect(fkPlanNeedsRenameDialog(planned, target.columns)).toBe(true);

        // 같은 이름 유지 → boundFk
        const keepSame = validateFkRenameRows(
            [
                {
                    sourceColumnId: "pk1",
                    logicalName: "id",
                    physicalName: "id",
                },
            ],
            {
                targetColumns: target.columns,
                relationships: useStore.getState().doc.model.relationships,
                sourceTableId: "parent",
                targetTableId: "child",
            },
        );
        expect(keepSame.ok).toBe(false);
        if (!keepSame.ok) expect(keepSame.messageKey).toBe("boundFk");

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
});
