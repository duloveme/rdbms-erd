import { describe, expect, it } from "vitest";
import {
  createColumn,
  createDefaultDbMetaAdapter,
  createEmptyDesign,
  generateDdl,
  generateDdlForSelection,
  LOGICAL_DATA_TYPES,
  resolveDialectMetas,
  serializeDesign,
  validateDesignDocument,
  type DdlGenerateInput,
  type DdlGenerateOutput,
  type DbMetaAdapter,
  type DialectMetaJson,
  type DialectMeta,
  type LogicalDataType
} from "../index";

function createAcmeAdapter(): DbMetaAdapter {
  const base = createDefaultDbMetaAdapter();
  const acmeTypeMap: Record<LogicalDataType, string> = {
    TEXT: "STRING(255)",
    DATE: "DATE",
    TIME: "TIME",
    DATETIME: "TIMESTAMP",
    NUMBER: "INT64",
    DECIMAL: "DECIMAL(10,2)",
    FLOAT: "DOUBLE",
    BOOLEAN: "BOOL",
    JSON: "JSON",
    UUID: "UUID",
    BINARY: "BYTES"
  };
  const acmeMeta: DialectMeta = {
    id: "acme",
    label: "AcmeDB",
    capabilities: { supportsSchema: true },
    logicalTypes: LOGICAL_DATA_TYPES,
    defaultPhysicalTypeMap: acmeTypeMap
  };
  return {
    listDialects: () => [...base.listDialects(), acmeMeta],
    getDialectMeta: (dialect) => (dialect === "acme" ? acmeMeta : base.getDialectMeta(dialect)),
    getDefaultPhysicalType: (dialect, logicalType) =>
      dialect === "acme" ? acmeTypeMap[logicalType] : base.getDefaultPhysicalType(dialect, logicalType),
    getDdlRules: (dialect) =>
      dialect === "acme"
        ? {
            ...base.getDdlRules(dialect),
            quoteIdentifier: (_d, id) => `<${id}>`
          }
        : base.getDdlRules(dialect)
  };
}

describe("db meta adapter", () => {
  it("allows host dialect for createColumn default physical type", () => {
    const adapter = createAcmeAdapter();
    const col = createColumn(
      "acme",
      {
        id: "c1",
        logicalName: "name",
        logicalType: "TEXT"
      },
      { dbMetaAdapter: adapter }
    );
    expect(col.physicalType).toBe("STRING(255)");
  });

  it("applies host quote rule and schema support to DDL", () => {
    const adapter = createAcmeAdapter();
    const doc = createEmptyDesign("acme");
    doc.model.tables.push({
      id: "t1",
      logicalName: "사용자",
      physicalName: "users",
      schemaName: "core",
      columns: [
        createColumn(
          "acme",
          {
            id: "id1",
            logicalName: "id",
            physicalName: "id",
            logicalType: "NUMBER",
            nullable: false,
            isPrimaryKey: true
          },
          { dbMetaAdapter: adapter }
        )
      ]
    });

    const sql = generateDdl(doc, { dbMetaAdapter: adapter });
    expect(sql).toContain("CREATE TABLE <core>.<users>");
    expect(sql).toContain("<id> INT64");
  });

  it("validates custom dialect when adapter provides it", () => {
    const adapter = createAcmeAdapter();
    const doc = createEmptyDesign("acme");
    const raw = JSON.parse(serializeDesign(doc));
    expect(() => validateDesignDocument(raw, { dbMetaAdapter: adapter })).not.toThrow();
  });

  it("merges host metas by id (override/append)", () => {
    const hostMetas: DialectMetaJson[] = [
      {
        id: "postgres",
        label: "Postgres Override",
        supportsSchema: true,
        logicalTypes: [{ id: "TEXT", defaultPhysicalType: "TEXT" }]
      },
      {
        id: "acme_json",
        label: "Acme JSON",
        supportsSchema: true,
        logicalTypes: [{ id: "TEXT", defaultPhysicalType: "STRING(255)" }]
      }
    ];
    const resolved = resolveDialectMetas({ hostMetas });
    expect(resolved.find((m) => m.id === "postgres")?.label).toBe("Postgres Override");
    expect(resolved.some((m) => m.id === "acme_json")).toBe(true);
  });

  it("calls host ddl generator with selected scope", () => {
    const doc = createEmptyDesign("postgres");
    doc.model.tables.push(
      { id: "t1", logicalName: "A", physicalName: "a", columns: [createColumn("postgres", { id: "c1", logicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true })] },
      { id: "t2", logicalName: "B", physicalName: "b", columns: [createColumn("postgres", { id: "c2", logicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true })] }
    );
    const calls: DdlGenerateInput[] = [];
    const hostGenerator = (input: DdlGenerateInput): DdlGenerateOutput => {
      calls.push(input);
      return { sql: "-- custom" };
    };
    const out = generateDdlForSelection(doc, ["t1"], {
      hostDdlGenerators: { postgres: hostGenerator }
    });
    expect(out.sql).toBe("-- custom");
    expect(calls).toHaveLength(1);
    expect(calls[0].scope.kind).toBe("selected");
  });

  it("falls back to style generator when host hook throws", () => {
    const doc = createEmptyDesign("postgres");
    doc.model.tables.push({
      id: "t1",
      logicalName: "사용자",
      physicalName: "users",
      columns: [createColumn("postgres", { id: "c1", logicalName: "id", logicalType: "NUMBER", nullable: false, isPrimaryKey: true })]
    });
    const sql = generateDdl(doc, {
      hostDdlGenerators: {
        postgres: () => {
          throw new Error("boom");
        }
      },
      fallbackOnHookError: true
    });
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("\"users\"");
  });
});
