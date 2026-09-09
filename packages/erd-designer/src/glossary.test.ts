import { describe, expect, it } from "vitest";
import { createColumn, type GlossaryEntry, type TableModel } from "@rdbms-erd/core";
import {
    applyGlossaryToTables,
    fillOppositeNamesFromGlossary,
    findGlossaryMatch,
    lookupLogicalName,
    lookupPhysicalName,
    mergeGlossaryEntries,
    parseGlossaryJson,
    removeGlossaryEntries,
    upsertGlossaryEntry,
} from "./glossary";

const SAMPLE: GlossaryEntry[] = [
    {
        id: "g1",
        logicalName: "창고ID",
        physicalName: "warehouse_id",
    },
    {
        id: "g2",
        logicalName: "정보수정일시",
        physicalName: "ChangeDateTime",
    },
];

describe("glossary helpers", () => {
    it("findGlossaryMatch uses only the configured key side", () => {
        expect(
            findGlossaryMatch(SAMPLE, "창고ID", "other", "logical")?.id,
        ).toBe("g1");
        expect(
            findGlossaryMatch(SAMPLE, "x", "warehouse_id", "logical"),
        ).toBeUndefined();
        expect(
            findGlossaryMatch(SAMPLE, "x", "changedatetime", "physical")?.id,
        ).toBe("g2");
        expect(
            findGlossaryMatch(SAMPLE, "창고ID", "none", "physical"),
        ).toBeUndefined();
    });

    it("looks up by logical and physical names case-insensitively", () => {
        expect(lookupPhysicalName(SAMPLE, "창고id")).toBe("warehouse_id");
        expect(lookupLogicalName(SAMPLE, "CHANGEDATETIME")).toBe(
            "정보수정일시",
        );
    });

    it("upserts matching by the configured key only", () => {
        const byLogical = upsertGlossaryEntry(
            SAMPLE,
            { logicalName: "창고ID", physicalName: "wh_id" },
            "logical",
        );
        expect(byLogical).toHaveLength(2);
        expect(byLogical[0]?.physicalName).toBe("wh_id");

        const noMatchPhysical = upsertGlossaryEntry(
            SAMPLE,
            { logicalName: "창고ID", physicalName: "wh_id" },
            "physical",
        );
        expect(noMatchPhysical).toHaveLength(3);

        const byPhysical = upsertGlossaryEntry(
            SAMPLE,
            { logicalName: "수정일시", physicalName: "ChangeDateTime" },
            "physical",
        );
        expect(byPhysical).toHaveLength(2);
        expect(byPhysical[1]?.logicalName).toBe("수정일시");
    });

    it("removes by ids", () => {
        expect(removeGlossaryEntries(SAMPLE, ["g1"]).map((e) => e.id)).toEqual([
            "g2",
        ]);
    });

    it("fills empty opposite names only when direction matches key", () => {
        const cols = [
            createColumn("mssql", {
                id: "c1",
                logicalName: "창고ID",
                physicalName: "",
                logicalType: "NUMBER",
            }),
            createColumn("mssql", {
                id: "c2",
                logicalName: "",
                physicalName: "ChangeDateTime",
                logicalType: "DATETIME",
            }),
        ];
        const toPhysLogical = fillOppositeNamesFromGlossary(
            cols,
            SAMPLE,
            "toPhysical",
            "logical",
        );
        expect(toPhysLogical[0]?.physicalName).toBe("warehouse_id");
        const toPhysPhysical = fillOppositeNamesFromGlossary(
            cols,
            SAMPLE,
            "toPhysical",
            "physical",
        );
        expect(toPhysPhysical[0]?.physicalName).toBe("");
        const toLogPhysical = fillOppositeNamesFromGlossary(
            cols,
            SAMPLE,
            "toLogical",
            "physical",
        );
        expect(toLogPhysical[1]?.logicalName).toBe("정보수정일시");
        const toLogLogical = fillOppositeNamesFromGlossary(
            cols,
            SAMPLE,
            "toLogical",
            "logical",
        );
        expect(toLogLogical[1]?.logicalName).toBe("");
    });

    it("batch applies selected entries and overwrites opposite names", () => {
        const tables: TableModel[] = [
            {
                id: "t1",
                logicalName: "T",
                physicalName: "t",
                columns: [
                    createColumn("mssql", {
                        id: "c1",
                        logicalName: "창고ID",
                        physicalName: "",
                        logicalType: "NUMBER",
                    }),
                    createColumn("mssql", {
                        id: "c2",
                        logicalName: "정보수정일시",
                        physicalName: "KeepMe",
                        logicalType: "DATETIME",
                    }),
                ],
            },
        ];
        const byLogical = applyGlossaryToTables(
            tables,
            SAMPLE,
            ["g1", "g2"],
            "logical",
        );
        expect(byLogical[0]?.columns[0]?.physicalName).toBe("warehouse_id");
        expect(byLogical[0]?.columns[1]?.physicalName).toBe("ChangeDateTime");

        const byPhysical = applyGlossaryToTables(
            [
                {
                    id: "t1",
                    logicalName: "T",
                    physicalName: "t",
                    columns: [
                        createColumn("mssql", {
                            id: "c1",
                            logicalName: "Old",
                            physicalName: "warehouse_id",
                            logicalType: "NUMBER",
                        }),
                    ],
                },
            ],
            SAMPLE,
            ["g1"],
            "physical",
        );
        expect(byPhysical[0]?.columns[0]?.logicalName).toBe("창고ID");
    });
});

describe("glossary JSON import", () => {
    it("parses a bare array and a wrapped object the same way", () => {
        const rows = [{ id: "g9", logicalName: "창고ID", physicalName: "wh" }];
        expect(parseGlossaryJson(JSON.stringify(rows))).toEqual(rows);
        expect(parseGlossaryJson(JSON.stringify({ glossary: rows }))).toEqual(
            rows,
        );
    });

    it("skips incomplete rows and generates missing ids", () => {
        const parsed = parseGlossaryJson(
            JSON.stringify([
                { logicalName: "  창고ID  ", physicalName: " wh " },
                { logicalName: "", physicalName: "wh" },
                { logicalName: "only-logical" },
                "not-an-object",
            ]),
        );
        expect(parsed).toHaveLength(1);
        expect(parsed[0]?.logicalName).toBe("창고ID");
        expect(parsed[0]?.physicalName).toBe("wh");
        expect(parsed[0]?.id).toBeTruthy();
    });

    it("throws when the payload is not an entry list", () => {
        expect(() => parseGlossaryJson(JSON.stringify({ a: 1 }))).toThrow();
    });

    it("merges by upserting on the match key", () => {
        const merged = mergeGlossaryEntries(
            SAMPLE,
            [
                { id: "i1", logicalName: "창고ID", physicalName: "wh_id" },
                { id: "i2", logicalName: "신규", physicalName: "new_col" },
            ],
            "logical",
        );
        expect(merged).toHaveLength(3);
        expect(merged[0]?.physicalName).toBe("wh_id");
        expect(merged[0]?.id).toBe("g1");
        expect(merged[2]?.logicalName).toBe("신규");
    });

    it("gives an appended entry a fresh id when the imported id collides", () => {
        const merged = mergeGlossaryEntries(
            SAMPLE,
            [{ id: "g1", logicalName: "신규", physicalName: "new_col" }],
            "logical",
        );
        expect(merged).toHaveLength(3);
        expect(merged[2]?.id).not.toBe("g1");
        expect(new Set(merged.map((e) => e.id)).size).toBe(3);
    });
});
