import {
    type CoreDbMetaOptions,
    createColumn,
    createId,
    type LogicalDataType,
    type RdbmsDialect,
    type TableModel,
} from "@rdbms-erd/core";
import { columnNamesBlank } from "./tableEditDraftSync";

/**
 * Host-provided template for the Table dialog "Create default columns" action.
 * On append: `logicalName` → column logical name, `physicalName` → column physical name.
 */
export type DefaultColumnSpec = {
    logicalName: string;
    /** When omitted, same as `logicalName`. */
    physicalName?: string;
    logicalType: LogicalDataType;
    /** When omitted, dialect default for `logicalType`. */
    physicalType?: string;
    /** Default true. Never primary key. */
    nullable?: boolean;
};

function nameKey(value: string | undefined): string {
    return (value ?? "").trim().toLowerCase();
}

function columnNameKeys(col: {
    logicalName?: string;
    physicalName?: string;
}): Set<string> {
    const keys = new Set<string>();
    const lk = nameKey(col.logicalName);
    const pk = nameKey(col.physicalName);
    if (lk) keys.add(lk);
    if (pk) keys.add(pk);
    return keys;
}

function existingNameKeySet(columns: TableModel["columns"]): Set<string> {
    const keys = new Set<string>();
    for (const col of columns) {
        if (columnNamesBlank(col)) continue;
        for (const k of columnNameKeys(col)) keys.add(k);
    }
    return keys;
}

function specConflictsWithExisting(
    spec: DefaultColumnSpec,
    existing: Set<string>,
): boolean {
    const logical = nameKey(spec.logicalName);
    const physical = nameKey(spec.physicalName ?? spec.logicalName);
    if (logical && existing.has(logical)) return true;
    if (physical && existing.has(physical)) return true;
    return false;
}

/**
 * Appends host default-column specs after named columns and before trailing blank rows.
 * Specs whose logical/physical names already exist (case-insensitive) are skipped.
 */
export function appendDefaultColumns(
    draft: TableModel,
    specs: readonly DefaultColumnSpec[],
    dialect: RdbmsDialect,
    coreOptions?: CoreDbMetaOptions,
): TableModel {
    if (specs.length === 0) return draft;

    const existing = existingNameKeySet(draft.columns);
    const toInsert = [];

    for (const spec of specs) {
        const logicalName = spec.logicalName?.trim() ?? "";
        if (!logicalName) continue;
        if (specConflictsWithExisting(spec, existing)) continue;

        const physicalName = (spec.physicalName ?? spec.logicalName).trim();
        let col = createColumn(
            dialect,
            {
                id: createId("col"),
                logicalName,
                physicalName: physicalName || logicalName,
                logicalType: spec.logicalType,
                nullable: spec.nullable ?? true,
                isPrimaryKey: false,
            },
            coreOptions,
        );
        if (spec.physicalType?.trim()) {
            col = { ...col, physicalType: spec.physicalType.trim() };
        }

        toInsert.push(col);
        for (const k of columnNameKeys(col)) existing.add(k);
    }

    if (toInsert.length === 0) return draft;

    const named: typeof draft.columns = [];
    const blanks: typeof draft.columns = [];
    for (const col of draft.columns) {
        if (columnNamesBlank(col)) blanks.push(col);
        else named.push(col);
    }

    return {
        ...draft,
        columns: [...named, ...toInsert, ...blanks],
    };
}

/**
 * After logical-mode save normalization, restore explicit `physicalType` values
 * for columns that match the current `defaultColumns` specs by name.
 */
export function preserveDefaultColumnPhysicalTypes(
    draftBeforeNormalize: TableModel,
    normalized: TableModel,
    specs: readonly DefaultColumnSpec[],
): TableModel {
    if (specs.length === 0) return normalized;

    const specsWithExplicitType = specs.filter(
        (s) => (s.physicalType?.trim() ?? "").length > 0,
    );
    if (specsWithExplicitType.length === 0) return normalized;

    const draftById = new Map(
        draftBeforeNormalize.columns.map((c) => [c.id, c]),
    );

    const columns = normalized.columns.map((col) => {
        const draftCol = draftById.get(col.id);
        if (!draftCol) return col;
        const keys = columnNameKeys(col);
        const matched = specsWithExplicitType.some((spec) => {
            const logical = nameKey(spec.logicalName);
            const physical = nameKey(spec.physicalName ?? spec.logicalName);
            return (
                (logical !== "" && keys.has(logical)) ||
                (physical !== "" && keys.has(physical))
            );
        });
        if (!matched) return col;
        const pt = draftCol.physicalType?.trim();
        if (!pt) return col;
        return { ...col, physicalType: draftCol.physicalType };
    });

    return { ...normalized, columns };
}
