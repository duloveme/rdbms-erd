import type { TableModel } from "@rdbms-erd/core";
import ExcelJS from "exceljs";

const INVALID_SHEET = /[:\\/?*[\]]/g;

const BORDER_ARGB = "FFCBD5E1";
const HEADER_FILL = "FF2E5077";
const HEADER_FONT = "FFFFFFFF";
const META_VALUE_FILL = "FFF8FAFC";
const COLUMN_BODY_ALT = "FFF1F5F9";

/** 테이블 메타 라벨 (세로, A열) */
const TABLE_META_LABELS = [
    "Schema",
    "Physical Name",
    "Logical Name",
    "Description",
] as const;
/** ExcelJS 열 너비: Type / Default Value 공통 */
const EXCEL_TYPE_COL_WIDTH = 16.5;
/** Field Name(Physical): 긴 식별자·PascalCase 컬럼명 표시용 */
const EXCEL_FIELD_PHYSICAL_COL_WIDTH = 24;
/** Field Name(Logical): 한글 등 논리명 표시용(Physical보다 약간 넓게) */
const EXCEL_FIELD_LOGICAL_COL_WIDTH = 26;

/** 컬럼 영역 헤더 */
const COLUMN_HEADERS = [
    "Field Name(Physical)",
    "Field Name(Logical)",
    "Type",
    "Default Value",
    "PK",
    "Nullable",
    "Description",
] as const;

/** 컬럼 데이터 블록 최소 행 수(컬럼이 적어도 빈 행까지 동일 스타일 유지). */
const COLUMN_DATA_ROW_MIN = 20;
/** 테이블 메타 4행 + 빈 1행 */
const COLUMN_HEADER_ROW = 6;
const COLUMN_FIRST_DATA_ROW = 7;

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

const INVALID_FILENAME_CHARS = /[/\\?%*:|"<>]/g;

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

function uniqueSheetNames(tables: TableModel[]): string[] {
    const used = new Set<string>();
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

function buildSheet(ws: ExcelJS.Worksheet, table: TableModel): void {
    // 열 너비는 상수로 유지 (ExcelJS character width 단위)
    ws.getColumn(COL_IDX.fieldPhysical).width = EXCEL_FIELD_PHYSICAL_COL_WIDTH;
    ws.getColumn(COL_IDX.fieldLogical).width = EXCEL_FIELD_LOGICAL_COL_WIDTH;
    ws.getColumn(COL_IDX.type).width = EXCEL_TYPE_COL_WIDTH;
    ws.getColumn(COL_IDX.defaultValue).width = EXCEL_TYPE_COL_WIDTH;
    ws.getColumn(COL_IDX.pk).width = 4.5;
    ws.getColumn(COL_IDX.nullable).width = 10.5;
    ws.getColumn(COL_IDX.description).width = 42;

    // --- 테이블 메타: A열 라벨 / B~G열 값 병합 (세로 4행) ---
    const metaValues = [
        table.schemaName?.trim() ?? "",
        (table.physicalName ?? "").trim(),
        (table.logicalName ?? "").trim(),
        table.description?.trim() ?? "",
    ];
    TABLE_META_LABELS.forEach((label, i) => {
        const rowNum = i + 1;
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

    // --- 컬럼 영역 헤더 ---
    const rHeader = ws.getRow(COLUMN_HEADER_ROW);
    COLUMN_HEADERS.forEach((h, i) => {
        const colIndex = i + 1;
        const cell = rHeader.getCell(colIndex);
        cell.value = h;
        const center = colIndex === COL_IDX.pk || colIndex === COL_IDX.nullable;
        styleHeaderCell(cell, center ? "center" : "left");
    });

    const columns = Array.isArray(table.columns) ? table.columns : [];
    const columnDataRowCount = Math.max(
        COLUMN_DATA_ROW_MIN,
        columns.length,
    );

    // --- 컬럼 데이터: 최소 20행, 컬럼이 더 많으면 그만큼 확장 ---
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
 * 테이블마다 워크시트 1개, Field Name(Physical/Logical), Type, Default Value, PK 등으로 `.xlsx` 다운로드(브라우저).
 * 파일명: `프로젝트명_YYYY-MM-DD.xlsx` (`projectName`이 비거나 정리 후 비면 `project`).
 */
export async function exportTablesToXlsxFile(
    tables: TableModel[],
    options?: { projectName?: unknown },
): Promise<void> {
    if (tables.length === 0 || typeof window === "undefined") return;

    const wb = new ExcelJS.Workbook();
    wb.creator = "rdbms-erd";
    const sorted = sortTablesForExport(tables);
    const names = uniqueSheetNames(sorted);

    for (let i = 0; i < sorted.length; i++) {
        const table = sorted[i]!;
        const ws = wb.addWorksheet(names[i]!, {
            views: [{ showGridLines: false }],
        });
        buildSheet(ws, table);
    }

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
