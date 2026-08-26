import { describe, expect, it } from "vitest";
import { createColumn, type TableModel } from "@rdbms-erd/core";
import {
    appendDefaultColumns,
    preserveDefaultColumnPhysicalTypes,
    type DefaultColumnSpec,
} from "./defaultColumns";

const AUDIT_SPECS: readonly DefaultColumnSpec[] = [
    {
        logicalName: "CreateDateTime",
        logicalType: "DATETIME",
        physicalType: "DATETIME",
    },
    {
        logicalName: "CreateUserID",
        logicalType: "TEXT",
        physicalType: "VARCHAR(50)",
    },
    {
        logicalName: "ChangeDateTime",
        logicalType: "DATETIME",
        physicalType: "DATETIME",
    },
    {
        logicalName: "ChangeUserID",
        logicalType: "TEXT",
        physicalType: "VARCHAR(50)",
    },
];

function blankTable(): TableModel {
    return {
        id: "t1",
        logicalName: "T",
        physicalName: "t",
        columns: [
            createColumn("mssql", {
                id: "blank",
                logicalName: "",
                physicalName: "",
                logicalType: "TEXT",
                nullable: true,
            }),
        ],
    };
}

describe("appendDefaultColumns", () => {
    it("appends all specs before trailing blank rows", () => {
        const next = appendDefaultColumns(blankTable(), AUDIT_SPECS, "mssql");
        expect(next.columns).toHaveLength(5);
        expect(next.columns.slice(0, 4).map((c) => c.logicalName)).toEqual([
            "CreateDateTime",
            "CreateUserID",
            "ChangeDateTime",
            "ChangeUserID",
        ]);
        expect(next.columns[4]?.logicalName).toBe("");
        expect(next.columns[0]?.physicalType).toBe("DATETIME");
        expect(next.columns[1]?.physicalType).toBe("VARCHAR(50)");
        expect(next.columns.every((c) => !c.isPrimaryKey)).toBe(true);
    });

    it("skips specs that conflict with existing names (case-insensitive)", () => {
        const draft: TableModel = {
            id: "t1",
            logicalName: "T",
            physicalName: "t",
            columns: [
                createColumn("mssql", {
                    id: "c1",
                    logicalName: "createdatetime",
                    physicalName: "CreateDateTime",
                    logicalType: "DATETIME",
                    nullable: true,
                }),
                createColumn("mssql", {
                    id: "blank",
                    logicalName: "",
                    physicalName: "",
                    logicalType: "TEXT",
                    nullable: true,
                }),
            ],
        };
        const next = appendDefaultColumns(draft, AUDIT_SPECS, "mssql");
        const named = next.columns.filter(
            (c) => c.logicalName.trim() || c.physicalName.trim(),
        );
        expect(named.map((c) => c.logicalName)).toEqual([
            "createdatetime",
            "CreateUserID",
            "ChangeDateTime",
            "ChangeUserID",
        ]);
    });

    it("returns draft unchanged when specs empty", () => {
        const draft = blankTable();
        expect(appendDefaultColumns(draft, [], "mssql")).toBe(draft);
    });

    it("uses dialect default physicalType when spec omits it", () => {
        const next = appendDefaultColumns(
            blankTable(),
            [{ logicalName: "Note", logicalType: "TEXT" }],
            "mssql",
        );
        expect(next.columns[0]?.physicalType).toBe("VARCHAR(20)");
    });

    it("registers logicalName and physicalName separately when they differ", () => {
        const specs: readonly DefaultColumnSpec[] = [
            {
                logicalName: "정보수정일시",
                physicalName: "ChangeDateTime",
                logicalType: "DATETIME",
                physicalType: "DATETIME",
            },
            {
                logicalName: "정보수정자",
                physicalName: "ChangeUserID",
                logicalType: "TEXT",
                physicalType: "VARCHAR(50)",
            },
        ];
        const next = appendDefaultColumns(blankTable(), specs, "mssql");
        const named = next.columns.filter(
            (c) => c.logicalName.trim() || c.physicalName.trim(),
        );
        expect(named).toHaveLength(2);
        expect(named[0]?.logicalName).toBe("정보수정일시");
        expect(named[0]?.physicalName).toBe("ChangeDateTime");
        expect(named[0]?.physicalType).toBe("DATETIME");
        expect(named[1]?.logicalName).toBe("정보수정자");
        expect(named[1]?.physicalName).toBe("ChangeUserID");
        expect(named[1]?.physicalType).toBe("VARCHAR(50)");
    });
});

describe("preserveDefaultColumnPhysicalTypes", () => {
    it("restores explicit physical types after logical normalize overwrite", () => {
        const draft = appendDefaultColumns(blankTable(), AUDIT_SPECS, "mssql");
        const normalized: TableModel = {
            ...draft,
            columns: draft.columns
                .filter((c) => c.logicalName.trim())
                .map((c) => ({
                    ...c,
                    // simulate logical-mode save rewriting TEXT → VARCHAR(20)
                    physicalType:
                        c.logicalType === "TEXT" ? "VARCHAR(20)" : "DATETIME2",
                })),
        };
        const preserved = preserveDefaultColumnPhysicalTypes(
            draft,
            normalized,
            AUDIT_SPECS,
        );
        expect(
            preserved.columns.find((c) => c.logicalName === "CreateUserID")
                ?.physicalType,
        ).toBe("VARCHAR(50)");
        expect(
            preserved.columns.find((c) => c.logicalName === "CreateDateTime")
                ?.physicalType,
        ).toBe("DATETIME");
    });
});
