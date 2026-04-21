import { describe, expect, it } from "vitest";
import { createColumn, createEmptyDesign, generateDdl, generateIndexDdl } from "../index";

function minimalDoc(dialect: "mssql" | "oracle" | "mysql" | "postgres" | "sqlite") {
  const doc = createEmptyDesign(dialect);
  doc.model.tables.push({
    id: "parent",
    logicalName: "부모",
    physicalName: "TB_PARENT",
    columns: [
      createColumn(dialect, {
        id: "pk",
        logicalName: "식별자",
        logicalType: "NUMBER",
        nullable: false
      })
    ]
  });
  doc.model.tables.push({
    id: "child",
    logicalName: "자식",
    physicalName: "TB_CHILD",
    columns: [
      createColumn(dialect, {
        id: "fk",
        logicalName: "부모참조",
        logicalType: "NUMBER",
        nullable: false
      })
    ]
  });
  doc.model.relationships.push({
    id: "rel1",
    sourceTableId: "parent",
    targetTableId: "child",
    sourceColumnId: "pk",
    targetColumnId: "fk"
  });
  doc.model.indexes.push({
    id: "ix1",
    tableId: "child",
    name: "IX_CHILD_PARENT",
    columns: ["부모참조"],
    unique: false
  });
  return doc;
}

describe("generateDdl / generateIndexDdl", () => {
  it.each(["postgres", "mysql", "oracle", "mssql", "sqlite"] as const)("dialect %s emits CREATE TABLE and FK", (dialect) => {
    const sql = generateDdl(minimalDoc(dialect));
    expect(sql).toContain("CREATE TABLE");
    expect(sql.toUpperCase()).toContain("FOREIGN KEY");
  });

  it("emits CREATE INDEX", () => {
    const ix = generateIndexDdl(minimalDoc("postgres"));
    expect(ix.toUpperCase()).toContain("CREATE ");
    expect(ix.toUpperCase()).toContain("INDEX");
  });

  it("includes PK, NOT NULL, and DEFAULT in table DDL", () => {
    const doc = createEmptyDesign("postgres");
    doc.model.tables.push({
      id: "t1",
      logicalName: "사용자",
      physicalName: "TB_USER",
      columns: [
        createColumn("postgres", {
          id: "id",
          logicalName: "아이디",
          physicalName: "USER_ID",
          logicalType: "NUMBER",
          isPrimaryKey: true
        }),
        createColumn("postgres", {
          id: "name",
          logicalName: "이름",
          physicalName: "USER_NAME",
          logicalType: "TEXT",
          nullable: false,
          defaultValue: "UNKNOWN"
        })
      ]
    });
    const sql = generateDdl(doc);
    expect(sql).toContain("PRIMARY KEY");
    expect(sql).toContain("NOT NULL");
    expect(sql).toContain("DEFAULT 'UNKNOWN'");
  });
});
