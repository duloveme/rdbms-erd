import { describe, expect, it } from "vitest";
import {
  createColumn,
  createEmptyDesign,
  isRelationshipLineRenderable,
  parseDesign,
  roundTripDesign,
  serializeDesign,
  validateDesignDocument
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

  it("isRelationshipLineRenderable respects FK column flag and global toggle", () => {
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
            isForeignKey: true,
            showFkRelationLine: false
          })
        ]
      }
    );
    const rel = {
      id: "r1",
      sourceTableId: "a",
      targetTableId: "b",
      sourceColumnId: "apk",
      targetColumnId: "bfk"
    };
    doc.model.relationships.push(rel);
    expect(isRelationshipLineRenderable(rel, doc.model, false)).toBe(false);
    expect(isRelationshipLineRenderable(rel, doc.model, true)).toBe(false);
    doc.model.tables[1].columns[0] = { ...doc.model.tables[1].columns[0], showFkRelationLine: true };
    expect(isRelationshipLineRenderable(rel, doc.model, true)).toBe(true);
  });
});
