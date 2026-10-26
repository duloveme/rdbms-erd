import { describe, expect, it } from "vitest";
import {
  createColumn,
  createEmptyDesign,
  defaultDbMetaAdapter,
  generateDdl,
  generateIndexDdl,
  type DialectMetaJson,
} from "../index";

function userTableDoc(dialect: "mssql" | "postgres") {
  const doc = createEmptyDesign(dialect);
  doc.model.tables.push({
    id: "t1",
    logicalName: "사용자",
    physicalName: "TB_USER",
    columns: [
      createColumn(dialect, {
        id: "id",
        logicalName: "아이디",
        physicalName: "USER_ID",
        logicalType: "NUMBER",
        isPrimaryKey: true,
      }),
      createColumn(dialect, {
        id: "name",
        logicalName: "이름",
        physicalName: "USER_NAME",
        logicalType: "TEXT",
        nullable: false,
        defaultValue: "UNKNOWN",
      }),
    ],
  });
  return doc;
}

const mssqlHostMetaOff: DialectMetaJson = {
  id: "mssql",
  label: "MS SQL Server",
  supportsSchema: true,
  logicalTypes: [{ id: "NUMBER", defaultPhysicalType: "INT" }],
  ddlStyle: {
    quote: "bracket",
    boolLiteral: "oneZero",
    primaryKeyNonclustered: false,
  },
};

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
    const sql = generateDdl(userTableDoc("postgres"));
    expect(sql).toContain("PRIMARY KEY");
    expect(sql).not.toContain("NONCLUSTERED");
    expect(sql).toContain("NOT NULL");
    expect(sql).toContain("DEFAULT 'UNKNOWN'");
  });

  it("emits named NONCLUSTERED PK for default mssql ddlStyle", () => {
    const sql = generateDdl(userTableDoc("mssql"));
    expect(sql).toContain(
      "CONSTRAINT [PK_TB_USER] PRIMARY KEY NONCLUSTERED ([USER_ID])",
    );
    expect(sql).not.toContain("\n  PRIMARY KEY (");
  });

  it("keeps anonymous PRIMARY KEY when hostMetas turns off mssql primaryKeyNonclustered", () => {
    const sql = generateDdl(userTableDoc("mssql"), {
      hostMetas: [mssqlHostMetaOff],
    });
    expect(sql).toContain("PRIMARY KEY ([USER_ID])");
    expect(sql).not.toContain("NONCLUSTERED");
    expect(sql).not.toContain("CONSTRAINT [PK_TB_USER]");
  });

  it("honors hostMetas primaryKeyNonclustered even when dbMetaAdapter is also passed", () => {
    const sql = generateDdl(userTableDoc("mssql"), {
      dbMetaAdapter: defaultDbMetaAdapter,
      hostMetas: [mssqlHostMetaOff],
    });
    expect(sql).toContain("PRIMARY KEY ([USER_ID])");
    expect(sql).not.toContain("NONCLUSTERED");
  });
});
