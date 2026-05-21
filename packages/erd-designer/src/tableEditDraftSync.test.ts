import { describe, expect, it } from "vitest";
import type { TableModel } from "@rdbms-erd/core";
import {
    applyLogicalFieldsFromPhysicalDraft,
    applyPhysicalFieldsFromLogicalDraft,
    normalizeTableEditForSave,
    patchColumnOnPhysicalTypeUserEdit,
    syncTableEditDraftOnOpen,
    syncTableEditDraftOnSwitchToLogical,
    syncTableEditDraftOnSwitchToPhysical,
} from "./tableEditDraftSync";

describe("tableEditDraftSync", () => {
    it("applyLogicalFieldsFromPhysicalDraft infers logical type only, not names", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "",
            physicalName: "USERS",
            columns: [
                {
                    id: "c1",
                    logicalName: "",
                    physicalName: "ID",
                    logicalType: "TEXT",
                    physicalType: "INT",
                    nullable: true,
                },
            ],
        };
        const next = applyLogicalFieldsFromPhysicalDraft(draft, "mssql");
        expect(next.logicalName).toBe("");
        expect(next.physicalName).toBe("USERS");
        expect(next.columns[0].logicalName).toBe("");
        expect(next.columns[0].physicalName).toBe("ID");
        expect(next.columns[0].logicalType).toBe("NUMBER");
    });

    it("applyPhysicalFieldsFromLogicalDraft sets physical type only, not names", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "Users",
            physicalName: "",
            columns: [
                {
                    id: "c1",
                    logicalName: "Name",
                    physicalName: "",
                    logicalType: "TEXT",
                    physicalType: "NVARCHAR(255)",
                    nullable: true,
                },
            ],
        };
        const next = applyPhysicalFieldsFromLogicalDraft(draft, "mssql");
        expect(next.logicalName).toBe("Users");
        expect(next.physicalName).toBe("");
        expect(next.columns[0].logicalName).toBe("Name");
        expect(next.columns[0].physicalName).toBe("");
        expect(next.columns[0].physicalType).toBe("VARCHAR(20)");
    });

    it("applyPhysicalFieldsFromLogicalDraft respects defaultPhysicalTypes", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "T",
            columns: [
                {
                    id: "c1",
                    logicalName: "N",
                    physicalName: "N",
                    logicalType: "TEXT",
                    physicalType: "X",
                    nullable: true,
                },
            ],
        };
        const next = applyPhysicalFieldsFromLogicalDraft(draft, "mssql", {
            defaultPhysicalTypes: { TEXT: "NVARCHAR(50)" },
        });
        expect(next.columns[0].physicalType).toBe("NVARCHAR(50)");
        expect(next.columns[0].physicalName).toBe("N");
    });

    it("applyPhysicalFieldsFromLogicalDraft with preserve keeps physicalType when physicalName is set", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "",
            columns: [
                {
                    id: "c1",
                    logicalName: "Id",
                    physicalName: "id",
                    logicalType: "TEXT",
                    physicalType: "BIGINT",
                    nullable: true,
                },
                {
                    id: "c2",
                    logicalName: "NewCol",
                    physicalName: "",
                    logicalType: "NUMBER",
                    physicalType: "INT",
                    nullable: true,
                },
            ],
        };
        const next = applyPhysicalFieldsFromLogicalDraft(draft, "mssql", undefined, {
            preservePhysicalTypeIfPhysicalNameSet: true,
        });
        expect(next.columns[0].physicalType).toBe("BIGINT");
        expect(next.columns[1].physicalType).toBe("INT");
    });

    it("syncTableEditDraftOnSwitchToPhysical keeps physicalType when physicalName is set", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "T",
            columns: [
                {
                    id: "c1",
                    logicalName: "Id",
                    physicalName: "id",
                    logicalType: "TEXT",
                    physicalType: "BIGINT",
                    nullable: true,
                },
                {
                    id: "c2",
                    logicalName: "NewCol",
                    physicalName: "",
                    logicalType: "NUMBER",
                    physicalType: "INT",
                    nullable: true,
                },
            ],
        };
        const next = syncTableEditDraftOnSwitchToPhysical(draft, "mssql");
        expect(next.columns[0].physicalType).toBe("BIGINT");
        expect(next.columns[1].physicalType).toBe("INT");
    });

    it("syncTableEditDraftOnOpen in logical mode applies default physical when physicalName is blank", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "",
            columns: [
                {
                    id: "c1",
                    logicalName: "Id",
                    physicalName: "",
                    logicalType: "TEXT",
                    physicalType: "BIGINT",
                    nullable: true,
                },
            ],
        };
        const opened = syncTableEditDraftOnOpen(
            draft,
            "mssql",
            undefined,
            "logical",
        );
        expect(opened.columns[0].physicalType).toBe("VARCHAR(20)");
    });

    it("syncTableEditDraftOnOpen in physical mode keeps stored physicalType", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "T",
            columns: [
                {
                    id: "c1",
                    logicalName: "Id",
                    physicalName: "id",
                    logicalType: "TEXT",
                    physicalType: "BIGINT",
                    nullable: true,
                },
            ],
        };
        const opened = syncTableEditDraftOnOpen(
            draft,
            "mssql",
            undefined,
            "physical",
        );
        expect(opened.columns[0].physicalType).toBe("BIGINT");
        expect(opened.columns[0].logicalType).toBe("NUMBER");
    });

    it("syncTableEditDraftOnSwitchToLogical updates logicalType when mapping mismatches physical", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "T",
            columns: [
                {
                    id: "c1",
                    logicalName: "Id",
                    physicalName: "id",
                    logicalType: "TEXT",
                    physicalType: "BIGINT",
                    nullable: true,
                },
            ],
        };
        const next = syncTableEditDraftOnSwitchToLogical(draft, "mssql");
        expect(next.columns[0].logicalType).toBe("NUMBER");
        expect(next.columns[0].physicalType).toBe("BIGINT");
    });

    it("syncTableEditDraftOnSwitchToLogical keeps logicalType when it matches inferred mapping", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "T",
            columns: [
                {
                    id: "c1",
                    logicalName: "Id",
                    physicalName: "id",
                    logicalType: "NUMBER",
                    physicalType: "BIGINT",
                    nullable: true,
                },
            ],
        };
        const next = syncTableEditDraftOnSwitchToLogical(draft, "mssql");
        expect(next.columns[0].logicalType).toBe("NUMBER");
    });

    it("patchColumnOnPhysicalTypeUserEdit always infers logicalType", () => {
        const patched = patchColumnOnPhysicalTypeUserEdit("mssql", "decimal(18,2)");
        expect(patched.physicalType).toBe("DECIMAL(18,2)");
        expect(patched.logicalType).toBe("DECIMAL");
    });

    it("normalizeTableEditForSave in physical mode keeps edited physicalType", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "T",
            columns: [
                {
                    id: "c1",
                    logicalName: "Id",
                    physicalName: "id",
                    logicalType: "TEXT",
                    physicalType: "BIGINT",
                    nullable: true,
                },
            ],
        };
        const saved = normalizeTableEditForSave(draft, "mssql", undefined, "physical");
        expect(saved.columns[0].physicalType).toBe("BIGINT");
        expect(saved.columns[0].logicalType).toBe("NUMBER");
    });

    it("normalizeTableEditForSave in logical mode applies default physical from logical", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "T",
            columns: [
                {
                    id: "c1",
                    logicalName: "N",
                    physicalName: "n",
                    logicalType: "TEXT",
                    physicalType: "BIGINT",
                    nullable: true,
                },
            ],
        };
        const saved = normalizeTableEditForSave(draft, "mssql", undefined, "logical");
        expect(saved.columns[0].physicalType).toBe("VARCHAR(20)");
    });
});
