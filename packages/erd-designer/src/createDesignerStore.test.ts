import { createColumn, createDefaultDbMetaAdapter, LOGICAL_DATA_TYPES, type DbMetaAdapter, type DialectMeta, type LogicalDataType } from "@rdbms-erd/core";
import { describe, expect, it } from "vitest";
import { createDesignerStore } from "./createDesignerStore";

describe("createDesignerStore + zundo", () => {
  const createAcmeAdapter = (): DbMetaAdapter => {
    const base = createDefaultDbMetaAdapter();
    const acmeTypes: Record<LogicalDataType, string> = {
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
      defaultPhysicalTypeMap: acmeTypes
    };
    return {
      listDialects: () => [...base.listDialects(), acmeMeta],
      getDialectMeta: (dialect) => (dialect === "acme" ? acmeMeta : base.getDialectMeta(dialect)),
      getDefaultPhysicalType: (dialect, logicalType) =>
        dialect === "acme" ? acmeTypes[logicalType] : base.getDefaultPhysicalType(dialect, logicalType),
      getDdlRules: (dialect) => base.getDdlRules(dialect)
    };
  };

  it("undo restores previous document after addTable", () => {
    const useStore = createDesignerStore({ initialDialect: "postgres" });
    const t = useStore.getState();
    t.addTable(
      {
        id: "x1",
        logicalName: "A",
        physicalName: "TA",
        columns: [
          createColumn("postgres", {
            id: "c1",
            logicalName: "id",
            physicalName: "ID",
            logicalType: "NUMBER",
            nullable: false
          })
        ]
      },
      1,
      2
    );
    expect(useStore.getState().doc.model.tables).toHaveLength(1);
    useStore.temporal.getState().undo();
    expect(useStore.getState().doc.model.tables).toHaveLength(0);
    useStore.temporal.getState().redo();
    expect(useStore.getState().doc.model.tables).toHaveLength(1);
  });

  it("setColumnLogicalName syncs physical name when it still matched previous logical name", () => {
    const useStore = createDesignerStore({ initialDialect: "postgres" });
    useStore.getState().addTable(
      {
        id: "t1",
        logicalName: "T",
        physicalName: "PT",
        columns: [
          createColumn("postgres", {
            id: "c1",
            logicalName: "이름",
            logicalType: "TEXT"
          })
        ]
      },
      0,
      0
    );
    expect(useStore.getState().doc.model.tables[0].columns[0].physicalName).toBe("이름");
    useStore.getState().setColumnPhysicalName("t1", "c1", "CustomCol");
    useStore.getState().setColumnLogicalName("t1", "c1", "표시명");
    expect(useStore.getState().doc.model.tables[0].columns[0].physicalName).toBe("CustomCol");
  });

  it("alignSelected is one undo step", () => {
    const useStore = createDesignerStore({ initialDialect: "postgres" });
    const s = useStore.getState();
    s.addTable({ id: "a", logicalName: "A", physicalName: "TA", columns: [] }, 0, 0);
    s.addTable({ id: "b", logicalName: "B", physicalName: "TB", columns: [] }, 100, 0);
    const before = useStore.getState().doc.layout.nodePositions.b.x;
    useStore.getState().alignSelected(["a", "b"], "left");
    const after = useStore.getState().doc.layout.nodePositions.b.x;
    expect(after).not.toBe(before);
    useStore.temporal.getState().undo();
    expect(useStore.getState().doc.layout.nodePositions.b.x).toBe(before);
  });

  it("removeRelationship deletes auto-created FK column", () => {
    const useStore = createDesignerStore({ initialDialect: "postgres" });
    useStore.getState().addTable(
      {
        id: "pk",
        logicalName: "P",
        physicalName: "TP",
        columns: [createColumn("postgres", { id: "pkc", logicalName: "ID", logicalType: "NUMBER", nullable: false })]
      },
      0,
      0
    );
    useStore.getState().addTable(
      {
        id: "fk",
        logicalName: "F",
        physicalName: "TF",
        columns: [createColumn("postgres", { id: "base", logicalName: "Name", logicalType: "TEXT" })]
      },
      100,
      0
    );
    useStore.getState().setTableColumns("fk", [
      ...useStore.getState().doc.model.tables.find((t) => t.id === "fk")!.columns,
      createColumn("postgres", { id: "fkcol", logicalName: "ID", logicalType: "NUMBER" })
    ]);
    useStore.getState().addRelationship({
      id: "r1",
      sourceTableId: "pk",
      targetTableId: "fk",
      sourceColumnId: "pkc",
      targetColumnId: "fkcol",
      autoCreatedTargetColumn: true,
      originPkColumnId: "pkc"
    });

    useStore.getState().removeRelationship("r1");
    const fkTable = useStore.getState().doc.model.tables.find((t) => t.id === "fk")!;
    expect(fkTable.columns.some((c) => c.id === "fkcol")).toBe(false);
  });

  it("setRelationshipCanvasLineHidden toggles relationship.canvasLineHidden", () => {
    const useStore = createDesignerStore({ initialDialect: "postgres" });
    useStore.getState().addTable(
      {
        id: "pk",
        logicalName: "P",
        physicalName: "TP",
        columns: [
          createColumn("postgres", {
            id: "pkc",
            logicalName: "ID",
            logicalType: "NUMBER",
            nullable: false,
            isPrimaryKey: true
          })
        ]
      },
      0,
      0
    );
    useStore.getState().addTable(
      {
        id: "fk",
        logicalName: "F",
        physicalName: "TF",
        columns: [
          createColumn("postgres", {
            id: "fkcol",
            logicalName: "ID",
            logicalType: "NUMBER",
            isForeignKey: true,
            referencesPrimaryColumnId: "pkc"
          })
        ]
      },
      100,
      0
    );
    useStore.getState().addRelationship({
      id: "r1",
      sourceTableId: "pk",
      targetTableId: "fk",
      sourceColumnId: "pkc",
      targetColumnId: "fkcol"
    });
    useStore.getState().setRelationshipCanvasLineHidden("r1", true);
    expect(useStore.getState().doc.model.relationships[0].canvasLineHidden).toBe(true);
    useStore.getState().setRelationshipCanvasLineHidden("r1", false);
    expect(useStore.getState().doc.model.relationships[0].canvasLineHidden).toBeUndefined();
  });

  it("removeRelationship deletes FK column by column metadata", () => {
    const useStore = createDesignerStore({ initialDialect: "postgres" });
    useStore.getState().addTable(
      {
        id: "pk",
        logicalName: "P",
        physicalName: "TP",
        columns: [createColumn("postgres", { id: "pkc", logicalName: "ID", logicalType: "NUMBER", nullable: false })]
      },
      0,
      0
    );
    useStore.getState().addTable(
      {
        id: "fk",
        logicalName: "F",
        physicalName: "TF",
        columns: [
          createColumn("postgres", {
            id: "fkcol",
            logicalName: "ID",
            logicalType: "NUMBER",
            isForeignKey: true,
            referencesPrimaryColumnId: "pkc"
          })
        ]
      },
      100,
      0
    );
    useStore.getState().addRelationship({
      id: "r2",
      sourceTableId: "pk",
      targetTableId: "fk",
      sourceColumnId: "pkc",
      targetColumnId: "fkcol",
      autoCreatedTargetColumn: false,
      originPkColumnId: "pkc"
    });
    useStore.getState().removeRelationship("r2");
    const fkTable = useStore.getState().doc.model.tables.find((t) => t.id === "fk")!;
    expect(fkTable.columns.some((c) => c.id === "fkcol")).toBe(false);
  });

  it("setColumnLogicalType uses host adapter default physical type", () => {
    const adapter = createAcmeAdapter();
    const useStore = createDesignerStore({ initialDialect: "acme", coreOptions: { dbMetaAdapter: adapter } });
    useStore.getState().addTable(
      {
        id: "t1",
        logicalName: "T",
        physicalName: "TT",
        columns: [createColumn("acme", { id: "c1", logicalName: "컬럼", logicalType: "TEXT" }, { dbMetaAdapter: adapter })]
      },
      0,
      0
    );
    useStore.getState().setColumnLogicalType("t1", "c1", "BOOLEAN");
    expect(useStore.getState().doc.model.tables[0].columns[0].physicalType).toBe("BOOL");
  });
});
