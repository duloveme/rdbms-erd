import { describe, expect, it } from "vitest";
import {
    findReusableFkColumn,
    findTargetPkColumnsForPhysicalMerge,
    fkPhysicalInputShowsConflict,
    fkPlanNeedsRenameDialog,
    physicalNameCollidesWithBoundFk,
    physicalNameUsedOnTarget,
    planForeignKeyColumns,
    validateFkRenameRows,
} from "./fkColumnPlan";
import { createColumn, type RelationshipModel } from "@rdbms-erd/core";

describe("fkColumnPlan", () => {
    it("fkPlanNeedsRenameDialog when target has same physical name", () => {
        const source = {
            id: "s",
            logicalName: "S",
            physicalName: "TS",
            columns: [
                createColumn("postgres", {
                    id: "pk1",
                    logicalName: "id",
                    logicalType: "NUMBER",
                    nullable: false,
                    isPrimaryKey: true,
                }),
            ],
        };
        const target = {
            id: "t",
            logicalName: "T",
            physicalName: "TT",
            columns: [
                createColumn("postgres", {
                    id: "c1",
                    logicalName: "name",
                    logicalType: "TEXT",
                    physicalName: "id",
                }),
            ],
        };
        const planned = planForeignKeyColumns(
            source,
            target,
            source.columns.filter((c) => c.isPrimaryKey),
        );
        expect(fkPlanNeedsRenameDialog(planned, target.columns)).toBe(true);
    });

    it("does not reuse FK that is already related; rename dialog needed", () => {
        const source = {
            id: "s",
            logicalName: "S",
            physicalName: "TS",
            columns: [
                createColumn("postgres", {
                    id: "pk1",
                    logicalName: "id",
                    logicalType: "NUMBER",
                    nullable: false,
                    isPrimaryKey: true,
                    physicalName: "id",
                }),
            ],
        };
        const fkCol = createColumn("postgres", {
            id: "fk1",
            logicalName: "id",
            logicalType: "NUMBER",
            physicalName: "id",
            isForeignKey: true,
            referencesPrimaryColumnId: "pk1",
        });
        const target = {
            id: "t",
            logicalName: "T",
            physicalName: "TT",
            columns: [fkCol],
        };
        const relationships: RelationshipModel[] = [
            {
                id: "r1",
                sourceTableId: "s",
                targetTableId: "t",
                sourceColumnId: "pk1",
                targetColumnId: "fk1",
            },
        ];
        const planned = planForeignKeyColumns(
            source,
            target,
            source.columns.filter((c) => c.isPrimaryKey),
            relationships,
        );
        expect(planned[0]?.reuseExisting).toBeNull();
        expect(fkPlanNeedsRenameDialog(planned, target.columns)).toBe(true);
        expect(
            physicalNameCollidesWithBoundFk(
                target.columns,
                relationships,
                "s",
                "t",
                "pk1",
                "id",
            ),
        ).toBe(true);
        const v = validateFkRenameRows(
            [
                {
                    sourceColumnId: "pk1",
                    logicalName: "created_by",
                    physicalName: "created_by",
                },
            ],
            {
                targetColumns: target.columns,
                relationships,
                sourceTableId: "s",
                targetTableId: "t",
            },
        );
        expect(v.ok).toBe(true);
        const vBound = validateFkRenameRows(
            [
                {
                    sourceColumnId: "pk1",
                    logicalName: "id",
                    physicalName: "id",
                },
            ],
            {
                targetColumns: target.columns,
                relationships,
                sourceTableId: "s",
                targetTableId: "t",
            },
        );
        expect(vBound.ok).toBe(false);
        if (!vBound.ok) expect(vBound.messageKey).toBe("boundFk");
    });

    it("reuses orphan FK column (no relationship yet)", () => {
        const source = {
            id: "s",
            logicalName: "S",
            physicalName: "TS",
            columns: [
                createColumn("postgres", {
                    id: "pk1",
                    logicalName: "id",
                    logicalType: "NUMBER",
                    nullable: false,
                    isPrimaryKey: true,
                    physicalName: "id",
                }),
            ],
        };
        const orphanFk = createColumn("postgres", {
            id: "fk_orphan",
            logicalName: "id",
            logicalType: "NUMBER",
            physicalName: "id",
            isForeignKey: true,
            referencesPrimaryColumnId: "pk1",
        });
        const target = {
            id: "t",
            logicalName: "T",
            physicalName: "TT",
            columns: [orphanFk],
        };
        const reusable = findReusableFkColumn(
            target.columns,
            [],
            "s",
            "t",
            "pk1",
        );
        expect(reusable?.id).toBe("fk_orphan");
        const planned = planForeignKeyColumns(
            source,
            target,
            source.columns.filter((c) => c.isPrimaryKey),
            [],
        );
        expect(planned[0]?.reuseExisting?.id).toBe("fk_orphan");
        expect(fkPlanNeedsRenameDialog(planned, target.columns)).toBe(false);
    });

    it("validateFkRenameRows rejects duplicate within draft", () => {
        const r = validateFkRenameRows([
            {
                sourceColumnId: "a",
                logicalName: "A",
                physicalName: "dup",
            },
            {
                sourceColumnId: "b",
                logicalName: "B",
                physicalName: "dup",
            },
        ]);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.messageKey).toBe("dupWithin");
    });

    it("fkPhysicalInputShowsConflict toggles when value matches table again", () => {
        const targetCols = [
            createColumn("postgres", {
                id: "c1",
                logicalName: "n",
                logicalType: "TEXT",
                physicalName: "id",
            }),
        ];
        const rows = [
            { physicalName: "other" },
            { physicalName: "id" },
        ];
        expect(
            fkPhysicalInputShowsConflict(targetCols, rows, 0),
        ).toBe(false);
        expect(
            fkPhysicalInputShowsConflict(targetCols, rows, 1),
        ).toBe(true);
        const rows2 = [{ physicalName: "id" }];
        expect(fkPhysicalInputShowsConflict(targetCols, rows2, 0)).toBe(true);
    });

    it("physicalNameUsedOnTarget respects excludeColumnId", () => {
        const cols = [
            createColumn("postgres", {
                id: "c1",
                logicalName: "a",
                logicalType: "TEXT",
                physicalName: "foo",
            }),
        ];
        expect(physicalNameUsedOnTarget(cols, "foo")).toBe(true);
        expect(physicalNameUsedOnTarget(cols, "foo", "c1")).toBe(false);
    });

    it("findTargetPkColumnsForPhysicalMerge returns PK columns kept by name", () => {
        const cols = [
            createColumn("postgres", {
                id: "pk",
                logicalName: "ID",
                logicalType: "NUMBER",
                physicalName: "id",
                nullable: false,
                isPrimaryKey: true,
            }),
            createColumn("postgres", {
                id: "name",
                logicalName: "Name",
                logicalType: "TEXT",
                physicalName: "name",
            }),
        ];
        const pkHits = findTargetPkColumnsForPhysicalMerge(
            cols,
            [],
            "s",
            "t",
            [
                {
                    sourceColumnId: "spk",
                    logicalName: "id",
                    physicalName: "id",
                },
            ],
        );
        expect(pkHits.map((c) => c.id)).toEqual(["pk"]);

        const nonPk = findTargetPkColumnsForPhysicalMerge(
            cols,
            [],
            "s",
            "t",
            [
                {
                    sourceColumnId: "spk",
                    logicalName: "name",
                    physicalName: "name",
                },
            ],
        );
        expect(nonPk).toEqual([]);

        const renamed = findTargetPkColumnsForPhysicalMerge(
            cols,
            [],
            "s",
            "t",
            [
                {
                    sourceColumnId: "spk",
                    logicalName: "parent_id",
                    physicalName: "parent_id",
                },
            ],
        );
        expect(renamed).toEqual([]);
    });

    it("findTargetPkColumnsForPhysicalMerge skips already-bound FK PK pairs", () => {
        const cols = [
            createColumn("postgres", {
                id: "pk",
                logicalName: "ID",
                logicalType: "NUMBER",
                physicalName: "id",
                nullable: false,
                isPrimaryKey: true,
                isForeignKey: true,
                referencesPrimaryColumnId: "spk",
            }),
        ];
        const relationships: RelationshipModel[] = [
            {
                id: "r1",
                sourceTableId: "s",
                targetTableId: "t",
                sourceColumnId: "spk",
                targetColumnId: "pk",
            },
        ];
        expect(
            findTargetPkColumnsForPhysicalMerge(cols, relationships, "s", "t", [
                {
                    sourceColumnId: "spk",
                    logicalName: "id",
                    physicalName: "id",
                },
            ]),
        ).toEqual([]);
    });
});
