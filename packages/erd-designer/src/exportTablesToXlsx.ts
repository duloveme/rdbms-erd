import type { TableModel } from "@rdbms-erd/core";
import ExcelJS from "exceljs";
import { createTranslator } from "./i18n/createTranslator";
import type { I18nKey, I18nVars } from "./i18n/types";

const INVALID_SHEET = /[:\\/?*[\]]/g;

const BORDER_ARGB = "FFCBD5E1";
const HEADER_FILL = "FF2E5077";
const HEADER_FONT = "FFFFFFFF";
const META_VALUE_FILL = "FFF8FAFC";
const COLUMN_BODY_ALT = "FFF1F5F9";
const HYPERLINK_FONT = "FF0563C1";

/** ExcelJS 열 너비: Type / Default Value 공통 */
const EXCEL_TYPE_COL_WIDTH = 16.5;
/** Field Name(Physical): 긴 식별자·PascalCase 컬럼명 표시용 */
const EXCEL_FIELD_PHYSICAL_COL_WIDTH = 24;
/** Field Name(Logical): 한글 등 논리명 표시용(Physical보다 약간 넓게) */
const EXCEL_FIELD_LOGICAL_COL_WIDTH = 26;
/** 목록 시트 스키마 열 */
const EXCEL_LIST_SCHEMA_COL_WIDTH = 14;
/** 목록 시트 물리/논리 테이블명 열 */
const EXCEL_LIST_TABLE_NAME_COL_WIDTH = 28;
/** 목록 시트 설명 열 */
const EXCEL_LIST_DESCRIPTION_COL_WIDTH = 42;

/** 컬럼 데이터 블록 최소 행 수(컬럼이 적어도 빈 행까지 동일 스타일 유지). */
const COLUMN_DATA_ROW_MIN = 20;
/** 목록 링크 1행 + 테이블 메타 4행 + 빈 1행 */
const COLUMN_HEADER_ROW = 7;
const COLUMN_FIRST_DATA_ROW = 8;
/** 목록으로 이동 링크 행 */
const BACK_TO_LIST_ROW = 1;
/** 테이블 메타 시작 행 (스키마) */
const TABLE_META_FIRST_ROW = 2;

/** 1-based 열 인덱스 (메타 라벨은 A열, 값은 B~마지막 열 병합). */
const COL_IDX = {
    fieldPhysical: 1,
    fieldLogical: 2,
    type: 3,
    defaultValue: 4,
    pk: 5,
    nullable: 6,
    description: 7,
} as const;

const LIST_COL = {
    schema: 1,
    tablePhysical: 2,
    tableLogical: 3,
    description: 4,
} as const;

const INVALID_FILENAME_CHARS = /[/\\?%*:|"<>]/g;

type TranslateFn = (key: I18nKey, vars?: I18nVars) => string;

export type ExportTablesToXlsxOptions = {
    projectName?: unknown;
    /** Host/UI translator; defaults to Korean bundle when omitted. */
    t?: TranslateFn;
};

function sanitizeProjectFileBase(projectName: unknown): string {
    const raw = typeof projectName === "string" ? projectName.trim() : "";
    const cleaned = raw
        .replace(INVALID_FILENAME_CHARS, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^\.+|\.+$/g, "")
        .trim();
    const cut = cleaned.slice(0, 120);
    return cut || "project";
}

function thinBorder(): ExcelJS.Borders {
    const edge = {
        style: "thin" as const,
        color: { argb: BORDER_ARGB },
    };
    return {
        top: edge,
        left: edge,
        bottom: edge,
        right: edge,
    } as ExcelJS.Borders;
}

function styleHeaderCell(
    cell: ExcelJS.Cell,
    horizontal: ExcelJS.Alignment["horizontal"] = "center",
): void {
    cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: HEADER_FILL },
    };
    cell.font = {
        bold: true,
        color: { argb: HEADER_FONT },
        size: 11,
        name: "Calibri",
    };
    cell.alignment = { vertical: "middle", horizontal };
    cell.border = thinBorder();
}

function styleMetaValueCell(cell: ExcelJS.Cell): void {
    cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: META_VALUE_FILL },
    };
    cell.font = { size: 11, name: "Calibri" };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = thinBorder();
}

function styleColumnBodyCell(
    cell: ExcelJS.Cell,
    alt: boolean,
    colIndex: number,
): void {
    if (alt) {
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COLUMN_BODY_ALT },
        };
    }
    cell.font = { size: 11, name: "Calibri" };
    const center = colIndex === COL_IDX.pk || colIndex === COL_IDX.nullable;
    cell.alignment = {
        vertical: "middle",
        horizontal: center ? "center" : "left",
    };
    cell.border = thinBorder();
}

function styleListBodyCell(cell: ExcelJS.Cell, alt: boolean, link: boolean): void {
    if (alt) {
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COLUMN_BODY_ALT },
        };
    }
    cell.font = link
        ? {
              size: 11,
              name: "Calibri",
              color: { argb: HYPERLINK_FONT },
              underline: true,
          }
        : { size: 11, name: "Calibri" };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = thinBorder();
}

function safeSheetLength31(raw: string, fallback: string): string {
    const t = raw.replace(INVALID_SHEET, "_").trim() || fallback;
    return t.length > 31 ? t.slice(0, 31) : t;
}

/** 시트명: `Schema.TableName` (스키마 없으면 `TableName`만). */
function schemaDotTableSheetBaseName(table: TableModel, idx: number): string {
    const schema = (table.schemaName ?? "").trim();
    const tname = (table.physicalName ?? "").trim();
    const joined = schema.length > 0 ? `${schema}.${tname}` : tname;
    const raw = joined || `Table_${idx + 1}`;
    return safeSheetLength31(raw, `Sheet_${idx + 1}`);
}

function sortTablesForExport(tables: TableModel[]): TableModel[] {
    return [...tables].sort((a, b) => {
        const sa = (a.schemaName ?? "").trim().toLowerCase();
        const sb = (b.schemaName ?? "").trim().toLowerCase();
        if (sa !== sb) {
            return sa.localeCompare(sb, undefined, { sensitivity: "base" });
        }
        const ta = (a.physicalName ?? "").trim().toLowerCase();
        const tb = (b.physicalName ?? "").trim().toLowerCase();
        return ta.localeCompare(tb, undefined, { sensitivity: "base" });
    });
}

/**
 * 목록 물리명 열: 스키마 없이 `physicalName`만.
 */
export function formatTableListPhysicalName(table: TableModel): string {
    return (table.physicalName ?? "").trim();
}

/** Excel 내부 시트 하이퍼링크 (`#'Sheet'!A1`). 시트명의 `'`는 `''`로 이스케이프. */
export function sheetInternalHyperlink(sheetName: string): string {
    const escaped = sheetName.replace(/'/g, "''");
    return `#'${escaped}'!A1`;
}

function uniqueSheetNames(
    tables: TableModel[],
    reservedNames: readonly string[] = [],
): string[] {
    const used = new Set(reservedNames.map((n) => n.toLowerCase()));
    const out: string[] = [];
    tables.forEach((table, idx) => {
        let base = schemaDotTableSheetBaseName(table, idx);
        let candidate = base;
        let n = 2;
        while (used.has(candidate.toLowerCase())) {
            const suffix = `_${n++}`;
            candidate = (
                base.slice(0, Math.max(1, 31 - suffix.length)) + suffix
            ).slice(0, 31);
        }
        used.add(candidate.toLowerCase());
        out.push(candidate);
    });
    return out;
}

function yn(v: boolean | undefined): string {
    return v ? "Y" : "N";
}

function resolveTranslate(t?: TranslateFn): TranslateFn {
    return t ?? createTranslator({ locale: "ko" });
}

function buildTableListSheet(
    ws: ExcelJS.Worksheet,
    tables: TableModel[],
    sheetNames: string[],
    t: TranslateFn,
): void {
    ws.getColumn(LIST_COL.schema).width = EXCEL_LIST_SCHEMA_COL_WIDTH;
    ws.getColumn(LIST_COL.tablePhysical).width = EXCEL_LIST_TABLE_NAME_COL_WIDTH;
    ws.getColumn(LIST_COL.tableLogical).width = EXCEL_LIST_TABLE_NAME_COL_WIDTH;
    ws.getColumn(LIST_COL.description).width = EXCEL_LIST_DESCRIPTION_COL_WIDTH;

    const headerRow = ws.getRow(1);
    const schemaHeader = headerRow.getCell(LIST_COL.schema);
    schemaHeader.value = t("excel.tableList.schema");
    styleHeaderCell(schemaHeader, "left");
    const physicalHeader = headerRow.getCell(LIST_COL.tablePhysical);
    physicalHeader.value = t("excel.tableList.tableNamePhysical");
    styleHeaderCell(physicalHeader, "left");
    const logicalHeader = headerRow.getCell(LIST_COL.tableLogical);
    logicalHeader.value = t("excel.tableList.tableNameLogical");
    styleHeaderCell(logicalHeader, "left");
    const descHeader = headerRow.getCell(LIST_COL.description);
    descHeader.value = t("excel.tableList.description");
    styleHeaderCell(descHeader, "left");

    for (let i = 0; i < tables.length; i++) {
        const table = tables[i]!;
        const sheetName = sheetNames[i]!;
        const rowIndex = i + 2;
        const row = ws.getRow(rowIndex);
        const alt = i % 2 === 1;
        const physicalName = formatTableListPhysicalName(table);

        const schemaCell = row.getCell(LIST_COL.schema);
        schemaCell.value = table.schemaName?.trim() ?? "";
        styleListBodyCell(schemaCell, alt, false);

        const physicalCell = row.getCell(LIST_COL.tablePhysical);
        physicalCell.value = {
            text: physicalName,
            hyperlink: sheetInternalHyperlink(sheetName),
        };
        styleListBodyCell(physicalCell, alt, true);

        const logicalCell = row.getCell(LIST_COL.tableLogical);
        logicalCell.value = (table.logicalName ?? "").trim();
        styleListBodyCell(logicalCell, alt, false);

        const descCell = row.getCell(LIST_COL.description);
        descCell.value = table.description?.trim() ?? "";
        styleListBodyCell(descCell, alt, false);
    }
}

function buildSheet(
    ws: ExcelJS.Worksheet,
    table: TableModel,
    t: TranslateFn,
    listSheetName: string,
): void {
    // 열 너비는 상수로 유지 (ExcelJS character width 단위)
    ws.getColumn(COL_IDX.fieldPhysical).width = EXCEL_FIELD_PHYSICAL_COL_WIDTH;
    ws.getColumn(COL_IDX.fieldLogical).width = EXCEL_FIELD_LOGICAL_COL_WIDTH;
    ws.getColumn(COL_IDX.type).width = EXCEL_TYPE_COL_WIDTH;
    ws.getColumn(COL_IDX.defaultValue).width = EXCEL_TYPE_COL_WIDTH;
    ws.getColumn(COL_IDX.pk).width = 4.5;
    ws.getColumn(COL_IDX.nullable).width = 10.5;
    ws.getColumn(COL_IDX.description).width = 42;

    const backRow = ws.getRow(BACK_TO_LIST_ROW);
    const backCell = backRow.getCell(COL_IDX.fieldPhysical);
    backCell.value = {
        text: t("excel.tableSheet.backToList"),
        hyperlink: sheetInternalHyperlink(listSheetName),
    };
    styleListBodyCell(backCell, false, true);
    ws.mergeCells(
        BACK_TO_LIST_ROW,
        COL_IDX.fieldPhysical,
        BACK_TO_LIST_ROW,
        COL_IDX.description,
    );

    const metaLabels = [
        t("excel.tableSheet.schema"),
        t("excel.tableSheet.physicalName"),
        t("excel.tableSheet.logicalName"),
        t("excel.tableSheet.description"),
    ] as const;
    const metaValues = [
        table.schemaName?.trim() ?? "",
        (table.physicalName ?? "").trim(),
        (table.logicalName ?? "").trim(),
        table.description?.trim() ?? "",
    ];
    metaLabels.forEach((label, i) => {
        const rowNum = TABLE_META_FIRST_ROW + i;
        const row = ws.getRow(rowNum);
        const labelCell = row.getCell(COL_IDX.fieldPhysical);
        labelCell.value = label;
        styleHeaderCell(labelCell, "left");
        const valueMaster = row.getCell(COL_IDX.fieldLogical);
        valueMaster.value = metaValues[i] ?? "";
        styleMetaValueCell(valueMaster);
        ws.mergeCells(
            rowNum,
            COL_IDX.fieldLogical,
            rowNum,
            COL_IDX.description,
        );
    });

    const columnHeaders = [
        t("excel.tableSheet.fieldPhysical"),
        t("excel.tableSheet.fieldLogical"),
        t("excel.tableSheet.type"),
        t("excel.tableSheet.defaultValue"),
        t("excel.tableSheet.pk"),
        t("excel.tableSheet.nullable"),
        t("excel.tableSheet.description"),
    ] as const;

    const rHeader = ws.getRow(COLUMN_HEADER_ROW);
    columnHeaders.forEach((h, i) => {
        const colIndex = i + 1;
        const cell = rHeader.getCell(colIndex);
        cell.value = h;
        const center = colIndex === COL_IDX.pk || colIndex === COL_IDX.nullable;
        styleHeaderCell(cell, center ? "center" : "left");
    });

    const columns = Array.isArray(table.columns) ? table.columns : [];
    const columnDataRowCount = Math.max(COLUMN_DATA_ROW_MIN, columns.length);

    for (let i = 0; i < columnDataRowCount; i++) {
        const rowIndex = COLUMN_FIRST_DATA_ROW + i;
        const row = ws.getRow(rowIndex);
        const col = columns[i];
        const alt = i % 2 === 1;
        const values: [string, string, string, string, string, string, string] =
            col
                ? [
                      (col.physicalName ?? "").trim(),
                      (col.logicalName ?? "").trim(),
                      col.physicalType ?? "",
                      (col.defaultValue ?? "").trim(),
                      yn(col.isPrimaryKey),
                      yn(col.nullable),
                      col.description?.trim() ?? "",
                  ]
                : ["", "", "", "", "", "", ""];
        values.forEach((v, j) => {
            const colIndex = j + 1;
            const cell = row.getCell(colIndex);
            cell.value = v;
            styleColumnBodyCell(cell, alt, colIndex);
        });
    }
}

/**
 * 첫 시트에 테이블 목록, 이후 테이블마다 워크시트 1개.
 * 라벨은 `t`(또는 기본 ko 번들)로 채운다.
 */
export function buildTablesXlsxWorkbook(
    tables: TableModel[],
    options?: Pick<ExportTablesToXlsxOptions, "t">,
): ExcelJS.Workbook {
    const t = resolveTranslate(options?.t);
    const wb = new ExcelJS.Workbook();
    wb.creator = "rdbms-erd";

    const sorted = sortTablesForExport(tables);
    const listSheetName = safeSheetLength31(
        t("excel.tableList.sheetName"),
        "TableList",
    );
    const names = uniqueSheetNames(sorted, [listSheetName]);

    const listWs = wb.addWorksheet(listSheetName, {
        views: [{ showGridLines: false }],
    });
    buildTableListSheet(listWs, sorted, names, t);

    for (let i = 0; i < sorted.length; i++) {
        const table = sorted[i]!;
        const ws = wb.addWorksheet(names[i]!, {
            views: [{ showGridLines: false }],
        });
        buildSheet(ws, table, t, listSheetName);
    }

    return wb;
}

/**
 * 테이블마다 워크시트 1개(+ 첫 시트 목록), Field Name(Physical/Logical), Type, Default Value, PK 등으로 `.xlsx` 다운로드(브라우저).
 * 파일명: `프로젝트명_YYYY-MM-DD.xlsx` (`projectName`이 비거나 정리 후 비면 `project`).
 */
export async function exportTablesToXlsxFile(
    tables: TableModel[],
    options?: ExportTablesToXlsxOptions,
): Promise<void> {
    if (tables.length === 0 || typeof window === "undefined") return;

    const wb = buildTablesXlsxWorkbook(tables, { t: options?.t });

    const stamp = new Date().toISOString().slice(0, 10);
    const base = sanitizeProjectFileBase(options?.projectName);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}_${stamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}
