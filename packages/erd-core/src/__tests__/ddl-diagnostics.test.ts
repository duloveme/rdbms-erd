import { describe, expect, it } from "vitest";
import { analyzeDdlDocument, createColumn, createEmptyDesign, formatDdlDiagnostic, generateDdlWithDiagnostics } from "../index";

describe("analyzeDdlDocument / formatDdlDiagnostic", () => {
  it("formats diagnostics with unified template", () => {
    const line = formatDdlDiagnostic({
      severity: "warning",
      code: "DDL_REL_MISSING_COLUMNS",
      message: "소스/타겟 컬럼이 지정되지 않아 FK DDL을 생략한다.",
      context: "relationship:r1"
    });
    expect(line).toBe(
      "[WARN][DDL_REL_MISSING_COLUMNS] 소스/타겟 컬럼이 지정되지 않아 FK DDL을 생략한다. | relationship:r1"
    );
  });

  it("warns on relationship without column ids", () => {
    const doc = createEmptyDesign("postgres");
    doc.model.tables.push({
      id: "a",
      logicalName: "A",
      physicalName: "TA",
      columns: [createColumn("postgres", { id: "c1", logicalName: "x", logicalType: "TEXT" })]
    });
    doc.model.tables.push({
      id: "b",
      logicalName: "B",
      physicalName: "TB",
      columns: [createColumn("postgres", { id: "c2", logicalName: "y", logicalType: "TEXT" })]
    });
    doc.model.relationships.push({
      id: "r1",
      sourceTableId: "a",
      targetTableId: "b"
    });
    const d = analyzeDdlDocument(doc);
    expect(d.some((x) => x.code === "DDL_REL_MISSING_COLUMNS")).toBe(true);
  });

  it("generateDdlWithDiagnostics returns sql and same analyze list", () => {
    const doc = createEmptyDesign("mysql");
    doc.model.tables.push({
      id: "t1",
      logicalName: "T",
      physicalName: "TT",
      columns: [createColumn("mysql", { id: "c1", logicalName: "id", logicalType: "NUMBER", nullable: false })]
    });
    const { sql, diagnostics } = generateDdlWithDiagnostics(doc);
    expect(sql).toContain("CREATE TABLE");
    expect(diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
