import type { TableModel } from "@rdbms-erd/core";
import { describe, expect, it } from "vitest";
import { createTranslator } from "./i18n/createTranslator";
import {
    buildTablesXlsxWorkbook,
    formatTableListPhysicalName,
    sheetInternalHyperlink,
} from "./exportTablesToXlsx";

function table(partial: Partial<TableModel> & Pick<TableModel, "id">): TableModel {
    return {
        logicalName: "",
        physicalName: "",
        columns: [],
        ...partial,
    };
}

describe("formatTableListPhysicalName", () => {
    it("returns physical name without schema", () => {
        expect(
            formatTableListPhysicalName(
                table({
                    id: "1",
                    schemaName: "dbo",
                    physicalName: "USERS",
                    logicalName: "사용자",
                }),
            ),
        ).toBe("USERS");
    });

    it("returns physical name when schema is absent", () => {
        expect(
            formatTableListPhysicalName(
                table({
                    id: "1",
                    physicalName: "USERS",
                    logicalName: "사용자",
                }),
            ),
        ).toBe("USERS");
    });

    it("returns empty string when physical is empty", () => {
        expect(
            formatTableListPhysicalName(
                table({
                    id: "1",
                    schemaName: "dbo",
                    physicalName: "",
                    logicalName: "사용자",
                }),
            ),
        ).toBe("");
    });
});

describe("sheetInternalHyperlink", () => {
    it("quotes sheet name and targets A1", () => {
        expect(sheetInternalHyperlink("dbo.USERS")).toBe("#'dbo.USERS'!A1");
    });

    it("escapes single quotes in sheet name", () => {
        expect(sheetInternalHyperlink("O'Brien")).toBe("#'O''Brien'!A1");
    });
});

describe("buildTablesXlsxWorkbook", () => {
    const sampleTables: TableModel[] = [
        table({
            id: "b",
            schemaName: "dbo",
            physicalName: "ORDERS",
            logicalName: "주문",
            description: "주문 테이블",
        }),
        table({
            id: "a",
            schemaName: "dbo",
            physicalName: "USERS",
            logicalName: "사용자",
            description: "사용자 테이블",
        }),
    ];

    it("puts localized list sheet first, then sorted table sheets (ko)", () => {
        const t = createTranslator({ locale: "ko" });
        const wb = buildTablesXlsxWorkbook(sampleTables, { t });
        expect(wb.worksheets.map((ws) => ws.name)).toEqual([
            "테이블 목록",
            "dbo.ORDERS",
            "dbo.USERS",
        ]);

        const list = wb.getWorksheet("테이블 목록")!;
        expect(list.getCell("A1").value).toBe("스키마");
        expect(list.getCell("B1").value).toBe("테이블명(물리)");
        expect(list.getCell("C1").value).toBe("테이블명(논리)");
        expect(list.getCell("D1").value).toBe("설명");

        expect(list.getCell("A2").value).toBe("dbo");
        const nameCell = list.getCell("B2").value as {
            text: string;
            hyperlink: string;
        };
        expect(nameCell.text).toBe("ORDERS");
        expect(nameCell.hyperlink).toBe("#'dbo.ORDERS'!A1");
        expect(list.getCell("C2").value).toBe("주문");
        expect(list.getCell("D2").value).toBe("주문 테이블");

        expect(list.getCell("A3").value).toBe("dbo");
        const usersName = list.getCell("B3").value as {
            text: string;
            hyperlink: string;
        };
        expect(usersName.text).toBe("USERS");
        expect(usersName.hyperlink).toBe("#'dbo.USERS'!A1");
        expect(list.getCell("C3").value).toBe("사용자");
        expect(list.getCell("D3").value).toBe("사용자 테이블");

        const detail = wb.getWorksheet("dbo.USERS")!;
        expect(detail.getCell("A1").value).toBe("스키마");
        expect(detail.getCell("A2").value).toBe("물리명");
        expect(detail.getCell("A3").value).toBe("논리명");
        expect(detail.getCell("A4").value).toBe("설명");
        expect(detail.getCell("A6").value).toBe("필드명(물리)");
        expect(detail.getCell("B6").value).toBe("필드명(논리)");
        expect(detail.getCell("C6").value).toBe("타입");
        expect(detail.getCell("D6").value).toBe("기본값");
        expect(detail.getCell("E6").value).toBe("PK");
        expect(detail.getCell("F6").value).toBe("널 허용");
        expect(detail.getCell("G6").value).toBe("설명");
    });

    it("uses English labels when locale is en", () => {
        const t = createTranslator({ locale: "en" });
        const wb = buildTablesXlsxWorkbook(sampleTables, { t });
        expect(wb.worksheets[0]!.name).toBe("Table List");

        const list = wb.getWorksheet("Table List")!;
        expect(list.getCell("A1").value).toBe("Schema");
        expect(list.getCell("B1").value).toBe("Table Name(Physical)");
        expect(list.getCell("C1").value).toBe("Table Name(Logical)");
        expect(list.getCell("D1").value).toBe("Description");

        const detail = wb.getWorksheet("dbo.USERS")!;
        expect(detail.getCell("A1").value).toBe("Schema");
        expect(detail.getCell("A2").value).toBe("Physical Name");
        expect(detail.getCell("A6").value).toBe("Field Name(Physical)");
        expect(detail.getCell("F6").value).toBe("Nullable");
    });

    it("defaults to Korean when t is omitted", () => {
        const wb = buildTablesXlsxWorkbook([
            table({
                id: "1",
                physicalName: "T1",
                logicalName: "테이블1",
            }),
        ]);
        expect(wb.worksheets[0]!.name).toBe("테이블 목록");
    });

    it("avoids colliding table sheet names with the list sheet name", () => {
        const t = createTranslator({ locale: "ko" });
        const wb = buildTablesXlsxWorkbook(
            [
                table({
                    id: "1",
                    physicalName: "테이블 목록",
                    logicalName: "충돌",
                }),
            ],
            { t },
        );
        expect(wb.worksheets.map((ws) => ws.name)).toEqual([
            "테이블 목록",
            "테이블 목록_2",
        ]);
        const list = wb.getWorksheet("테이블 목록")!;
        expect(list.getCell("A2").value).toBe("");
        const nameCell = list.getCell("B2").value as {
            text: string;
            hyperlink: string;
        };
        expect(nameCell.text).toBe("테이블 목록");
        expect(nameCell.hyperlink).toBe("#'테이블 목록_2'!A1");
        expect(list.getCell("C2").value).toBe("충돌");
    });
});
