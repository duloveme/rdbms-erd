import { describe, expect, it } from "vitest";
import {
  createColumn,
  createEmptyDesign,
  isRelationshipLineRenderable,
  parseDesign,
  roundTripDesign,
  serializeDesign,
  validateDesignDocument,
} from "../index";

describe("DesignDocument", () => {
  it("round-trips", () => {
    const doc = createEmptyDesign("mysql");
    doc.model.tables.push({
      id: "t1",
      logicalName: "엔티티",
      physicalName: "TB_T1",
      columns: []
    });
    const again = roundTripDesign(doc);
    expect(again.model.dialect).toBe("mysql");
    expect(again.model.tables).toHaveLength(1);
  });

  it("rejects invalid dialect", () => {
    const raw = JSON.parse(serializeDesign(createEmptyDesign()));
    raw.model.dialect = "mariadb";
    expect(() => validateDesignDocument(raw)).toThrow(/dialect/);
  });

  it("parseDesign validates", () => {
    const json = serializeDesign(createEmptyDesign("oracle"));
    expect(parseDesign(json).model.dialect).toBe("oracle");
  });

  it("createEmptyDesign defaults to mssql", () => {
    expect(createEmptyDesign().model.dialect).toBe("mssql");
  });

  it("isRelationshipLineRenderable respects relationship canvasLineHidden and reveal toggle", () => {
    const doc = createEmptyDesign("postgres");
    doc.model.tables.push(
      {
        id: "a",
        logicalName: "A",
        physicalName: "TA",
        columns: [createColumn("postgres", { id: "apk", logicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true })]
      },
      {
        id: "b",
        logicalName: "B",
        physicalName: "TB",
        columns: [
          createColumn("postgres", {
            id: "bfk",
            logicalName: "aid",
            logicalType: "NUMBER",
            isForeignKey: true
          })
        ]
      }
    );
    const rel = {
      id: "r1",
      sourceTableId: "a",
      targetTableId: "b",
      sourceColumnId: "apk",
      targetColumnId: "bfk",
      canvasLineHidden: true as const
    };
    doc.model.relationships.push(rel);
    expect(isRelationshipLineRenderable(rel, false)).toBe(false);
    expect(isRelationshipLineRenderable(rel, true)).toBe(true);
    delete rel.canvasLineHidden;
    expect(isRelationshipLineRenderable(rel, false)).toBe(true);
  });

  it("migrates legacy column showFkRelationLine false to relationship canvasLineHidden", () => {
    const doc = createEmptyDesign("postgres");
    doc.model.tables.push(
      {
        id: "a",
        logicalName: "A",
        physicalName: "TA",
        columns: [
          createColumn("postgres", {
            id: "apk",
            logicalName: "id",
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
            id: "bfk",
            logicalName: "aid",
            logicalType: "NUMBER",
            isForeignKey: true,
          }),
        ],
      },
    );
    doc.model.relationships.push({
      id: "r1",
      sourceTableId: "a",
      targetTableId: "b",
      sourceColumnId: "apk",
      targetColumnId: "bfk",
    });
    const raw = JSON.parse(serializeDesign(doc)) as Record<string, unknown>;
    const tables = (raw.model as { tables: { id: string; columns: Record<string, unknown>[] }[] }).tables;
    const bTable = tables.find((t) => t.id === "b");
    const fkCol = bTable?.columns.find((c) => c.id === "bfk");
    if (fkCol) fkCol.showFkRelationLine = false;
    const out = validateDesignDocument(raw);
    expect(out.model.relationships.find((r) => r.id === "r1")?.canvasLineHidden).toBe(true);
    const migratedFk = out.model.tables.find((t) => t.id === "b")?.columns.find((c) => c.id === "bfk");
    expect(
      migratedFk && "showFkRelationLine" in migratedFk ? (migratedFk as { showFkRelationLine?: boolean }).showFkRelationLine : undefined,
    ).toBeUndefined();
  });
});
