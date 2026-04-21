import { describe, expect, it } from "vitest";
import { applyLogicalTypeChange, convertDesignDialect, createColumn, createEmptyDesign, defaultPhysicalType } from "../index";

describe("logical / physical types", () => {
  it("createColumn defaults physical name to logical name and sets default physical type", () => {
    const col = createColumn("postgres", {
      id: "c1",
      logicalName: "이름",
      logicalType: "TEXT"
    });
    expect(col.physicalName).toBe("이름");
    expect(col.physicalType).toBe(defaultPhysicalType("postgres", "TEXT"));
  });

  it("createColumn uses explicit physical name when provided", () => {
    const col = createColumn("postgres", {
      id: "c1",
      logicalName: "이름",
      physicalName: "Name",
      logicalType: "TEXT"
    });
    expect(col.physicalName).toBe("Name");
  });

  it("applyLogicalTypeChange resets physical to default", () => {
    let col = createColumn("mssql", {
      id: "c1",
      logicalName: "수량",
      physicalName: "Qty",
      logicalType: "NUMBER"
    });
    col = { ...col, physicalType: "BIGINT" };
    col = applyLogicalTypeChange(col, "FLOAT", "mssql");
    expect(col.logicalType).toBe("FLOAT");
    expect(col.physicalType).toBe(defaultPhysicalType("mssql", "FLOAT"));
  });

  it("convertDesignDialect preserves numeric precision/scale when possible", () => {
    const doc = createEmptyDesign("mssql");
    doc.model.tables.push({
      id: "t1",
      logicalName: "주문",
      physicalName: "orders",
      columns: [
        {
          ...createColumn("mssql", {
            id: "c1",
            logicalName: "금액",
            physicalName: "amount",
            logicalType: "NUMBER"
          }),
          physicalType: "NUMERIC(10,5)"
        }
      ]
    });

    const oracleDoc = convertDesignDialect(doc, "oracle");
    expect(oracleDoc.model.tables[0].columns[0].physicalType).toBe("NUMBER(10,5)");

    const pgDoc = convertDesignDialect(doc, "postgres");
    expect(pgDoc.model.tables[0].columns[0].physicalType).toBe("NUMERIC(10,5)");
  });

  it("convertDesignDialect preserves varchar length when possible", () => {
    const doc = createEmptyDesign("postgres");
    doc.model.tables.push({
      id: "t1",
      logicalName: "상품",
      physicalName: "products",
      columns: [
        {
          ...createColumn("postgres", {
            id: "c1",
            logicalName: "코드",
            physicalName: "code",
            logicalType: "TEXT"
          }),
          physicalType: "VARCHAR(120)"
        }
      ]
    });

    const mssqlDoc = convertDesignDialect(doc, "mssql");
    expect(mssqlDoc.model.tables[0].columns[0].physicalType).toBe("NVARCHAR(120)");
  });

  it("defaultPhysicalType includes newly added logical types", () => {
    expect(defaultPhysicalType("postgres", "BOOLEAN")).toBe("BOOLEAN");
    expect(defaultPhysicalType("mysql", "JSON")).toBe("JSON");
    expect(defaultPhysicalType("oracle", "UUID")).toBe("RAW(16)");
    expect(defaultPhysicalType("sqlite", "BINARY")).toBe("BLOB");
    expect(defaultPhysicalType("mssql", "DECIMAL")).toBe("DECIMAL(10,2)");
  });
});
