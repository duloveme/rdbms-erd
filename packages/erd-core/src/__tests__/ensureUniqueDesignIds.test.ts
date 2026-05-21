import { describe, expect, it } from "vitest";
import {
    createId,
    ensureUniqueDesignIds,
    parseDesign,
    type DesignDocument,
} from "../index";

function duplicateTableDoc(): DesignDocument {
    return {
        schemaVersion: 1,
        model: {
            dialect: "postgres",
            tables: [
                {
                    id: "table-1",
                    logicalName: "A",
                    physicalName: "STB_A",
                    columns: [],
                },
                {
                    id: "table-1",
                    logicalName: "B",
                    physicalName: "STB_B",
                    columns: [],
                },
            ],
            relationships: [],
            indexes: [],
        },
        layout: {
            nodePositions: {
                "table-1": { x: 172, y: 124 },
            },
        },
    };
}

describe("ensureUniqueDesignIds", () => {
    it("reissues duplicate table ids and keeps both tables", () => {
        const out = ensureUniqueDesignIds(duplicateTableDoc());
        const ids = out.model.tables.map((t) => t.id);
        expect(out.model.tables).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        expect(ids[0]).toBe("table-1");
        expect(ids[1]).not.toBe("table-1");
        expect(ids[1]).toMatch(/^table-/);
        expect(out.layout.nodePositions[ids[0]!]).toEqual({ x: 172, y: 124 });
        expect(out.layout.nodePositions[ids[1]!]).toBeDefined();
    });

    it("reissues duplicate column ids within the document", () => {
        const doc: DesignDocument = {
            schemaVersion: 1,
            model: {
                dialect: "postgres",
                tables: [
                    {
                        id: "t-a",
                        logicalName: "A",
                        physicalName: "A",
                        columns: [{ id: "col-1", logicalName: "c", physicalName: "c" }],
                    },
                    {
                        id: "t-b",
                        logicalName: "B",
                        physicalName: "B",
                        columns: [{ id: "col-1", logicalName: "d", physicalName: "d" }],
                    },
                ],
                relationships: [],
                indexes: [],
            },
            layout: { nodePositions: {} },
        };
        const out = ensureUniqueDesignIds(doc);
        const colIds = out.model.tables.flatMap((t) => t.columns.map((c) => c.id));
        expect(new Set(colIds).size).toBe(2);
    });

    it("createId prefixes are stable shape", () => {
        expect(createId("table")).toMatch(/^table-/);
        expect(createId("col")).toMatch(/^col-/);
    });
});

describe("parseDesign", () => {
    it("normalizes duplicate table ids on parse", () => {
        const json = JSON.stringify(duplicateTableDoc());
        const out = parseDesign(json);
        const ids = out.model.tables.map((t) => t.id);
        expect(new Set(ids).size).toBe(2);
    });
});
