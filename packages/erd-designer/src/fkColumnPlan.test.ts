import { describe, expect, it } from "vitest";
import {
    fkPhysicalInputShowsConflict,
    fkPlanNeedsRenameDialog,
    physicalNameUsedOnTarget,
    planForeignKeyColumns,
    validateFkRenameRows,
} from "./fkColumnPlan";
import { createColumn } from "@rdbms-erd/core";

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
});
