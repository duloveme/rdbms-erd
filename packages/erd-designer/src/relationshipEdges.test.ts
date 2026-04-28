import { describe, expect, it } from "vitest";
import {
    buildRelationshipFlowEdges,
    relationshipRowCenterTopPx,
    sourceLineYForSourceColumnRow,
} from "./relationshipEdges";
import { createColumn, type DesignModel, type TableModel } from "@rdbms-erd/core";

describe("relationshipEdges composite group", () => {
    it("merges same relationshipGroupId into one edge with multiple relationshipIds", () => {
        const model: DesignModel = {
            dialect: "postgres",
            tables: [
                {
                    id: "a",
                    logicalName: "A",
                    physicalName: "TA",
                    columns: [
                        createColumn("postgres", {
                            id: "pk1",
                            logicalName: "k1",
                            physicalName: "k1",
                            logicalType: "NUMBER",
                            nullable: false,
                            isPrimaryKey: true,
                        }),
                        createColumn("postgres", {
                            id: "pk2",
                            logicalName: "k2",
                            physicalName: "k2",
                            logicalType: "NUMBER",
                            nullable: false,
                            isPrimaryKey: true,
                        }),
                    ],
                },
                {
                    id: "b",
                    logicalName: "B",
                    physicalName: "TB",
                    columns: [
                        createColumn("postgres", {
                            id: "fk1",
                            logicalName: "k1",
                            physicalName: "fk_k1",
                            logicalType: "NUMBER",
                            nullable: true,
                            isForeignKey: true,
                            referencesPrimaryColumnId: "pk1",
                        }),
                        createColumn("postgres", {
                            id: "fk2",
                            logicalName: "k2",
                            physicalName: "fk_k2",
                            logicalType: "NUMBER",
                            nullable: true,
                            isForeignKey: true,
                            referencesPrimaryColumnId: "pk2",
                        }),
                    ],
                },
            ],
            relationships: [
                {
                    id: "r1",
                    sourceTableId: "a",
                    targetTableId: "b",
                    relationshipGroupId: "g1",
                    sourceColumnId: "pk1",
                    targetColumnId: "fk1",
                    cardinality: "1:N",
                },
                {
                    id: "r2",
                    sourceTableId: "a",
                    targetTableId: "b",
                    relationshipGroupId: "g1",
                    sourceColumnId: "pk2",
                    targetColumnId: "fk2",
                    cardinality: "1:N",
                },
            ],
            indexes: [],
        };
        const positions = {
            a: { x: 0, y: 0 },
            b: { x: 500, y: 0 },
        };
        const edges = buildRelationshipFlowEdges(
            model,
            positions,
            400,
            false,
        );
        expect(edges).toHaveLength(1);
        expect(edges[0]?.data?.relationshipIds).toEqual(["r1", "r2"]);
        expect(edges[0]?.id).toBe("r1");
        expect(edges[0]?.targetHandle ?? "").toContain("fk1");
    });

    it("sourceLineYForSourceColumnRow matches rowCenterTop for first column", () => {
        const table: TableModel = {
            id: "t",
            logicalName: "T",
            physicalName: "TT",
            columns: [
                createColumn("postgres", {
                    id: "c0",
                    logicalName: "a",
                    physicalName: "a",
                    logicalType: "TEXT",
                    nullable: true,
                }),
                createColumn("postgres", {
                    id: "pk",
                    logicalName: "p",
                    physicalName: "p",
                    logicalType: "NUMBER",
                    nullable: false,
                    isPrimaryKey: true,
                }),
            ],
        };
        const idx = table.columns.findIndex((c) => c.id === "pk");
        const y = sourceLineYForSourceColumnRow(table, "pk");
        expect(y).toBe(
            relationshipRowCenterTopPx(idx, table.columns.length),
        );
    });
});
