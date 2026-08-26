import type {
    DesignModel,
    GlossaryEntry,
    TableModel,
} from "@rdbms-erd/core";
import { createId } from "@rdbms-erd/core";

/** Which name side is used as the glossary match / upsert key. */
export type GlossaryMatchKey = "logical" | "physical";

function nameKey(value: string | undefined): string {
    return (value ?? "").trim().toLowerCase();
}

/** First glossary entry matching the configured key side (case-insensitive). */
export function findGlossaryMatch(
    glossary: readonly GlossaryEntry[],
    logicalName: string,
    physicalName: string,
    matchKey: GlossaryMatchKey,
): GlossaryEntry | undefined {
    if (matchKey === "logical") {
        const lk = nameKey(logicalName);
        if (!lk) return undefined;
        return glossary.find((e) => nameKey(e.logicalName) === lk);
    }
    const pk = nameKey(physicalName);
    if (!pk) return undefined;
    return glossary.find((e) => nameKey(e.physicalName) === pk);
}

/** Look up physical name by logical name (first match, case-insensitive). */
export function lookupPhysicalName(
    glossary: readonly GlossaryEntry[],
    logicalName: string,
): string | undefined {
    const key = nameKey(logicalName);
    if (!key) return undefined;
    const hit = glossary.find((e) => nameKey(e.logicalName) === key);
    return hit?.physicalName;
}

/** Look up logical name by physical name (first match, case-insensitive). */
export function lookupLogicalName(
    glossary: readonly GlossaryEntry[],
    physicalName: string,
): string | undefined {
    const key = nameKey(physicalName);
    if (!key) return undefined;
    const hit = glossary.find((e) => nameKey(e.physicalName) === key);
    return hit?.logicalName;
}

/**
 * Upsert by matching the configured key side (case-insensitive).
 * Returns a new array; does not mutate.
 */
export function upsertGlossaryEntry(
    glossary: readonly GlossaryEntry[],
    entry: { logicalName: string; physicalName: string; id?: string },
    matchKey: GlossaryMatchKey,
): GlossaryEntry[] {
    const logicalName = entry.logicalName.trim();
    const physicalName = entry.physicalName.trim();
    if (!logicalName || !physicalName) return [...glossary];

    const matched = findGlossaryMatch(
        glossary,
        logicalName,
        physicalName,
        matchKey,
    );
    if (matched) {
        return glossary.map((e) =>
            e.id === matched.id
                ? { id: e.id, logicalName, physicalName }
                : e,
        );
    }
    return [
        ...glossary,
        {
            id: entry.id?.trim() || createId("gloss"),
            logicalName,
            physicalName,
        },
    ];
}

export function removeGlossaryEntries(
    glossary: readonly GlossaryEntry[],
    ids: readonly string[],
): GlossaryEntry[] {
    const set = new Set(ids);
    return glossary.filter((e) => !set.has(e.id));
}

/**
 * Apply selected glossary entries to columns, overwriting the opposite name.
 * Match side follows `matchKey`.
 */
export function applyGlossaryToTables(
    tables: readonly TableModel[],
    glossary: readonly GlossaryEntry[],
    entryIds: readonly string[],
    matchKey: GlossaryMatchKey,
): TableModel[] {
    const selected = glossary.filter((e) => entryIds.includes(e.id));
    if (selected.length === 0) return tables.map((t) => t);

    return tables.map((table) => ({
        ...table,
        columns: table.columns.map((col) => {
            let logicalName = col.logicalName;
            let physicalName = col.physicalName;

            for (const entry of selected) {
                if (
                    matchKey === "logical" &&
                    nameKey(col.logicalName) !== "" &&
                    nameKey(col.logicalName) === nameKey(entry.logicalName)
                ) {
                    physicalName = entry.physicalName;
                }
                if (
                    matchKey === "physical" &&
                    nameKey(col.physicalName) !== "" &&
                    nameKey(col.physicalName) === nameKey(entry.physicalName)
                ) {
                    logicalName = entry.logicalName;
                }
            }
            if (
                logicalName === col.logicalName &&
                physicalName === col.physicalName
            ) {
                return col;
            }
            return { ...col, logicalName, physicalName };
        }),
    }));
}

/**
 * Fill empty opposite column names from full glossary (e.g. mode switch).
 * Only the direction that matches `matchKey` is applied; the other is a no-op.
 */
export function fillOppositeNamesFromGlossary(
    columns: TableModel["columns"],
    glossary: readonly GlossaryEntry[],
    direction: "toPhysical" | "toLogical",
    matchKey: GlossaryMatchKey,
): TableModel["columns"] {
    if (glossary.length === 0) return columns;
    if (direction === "toPhysical" && matchKey !== "logical") return columns;
    if (direction === "toLogical" && matchKey !== "physical") return columns;

    return columns.map((col) => {
        if (direction === "toPhysical") {
            if (col.physicalName?.trim()) return col;
            if (!col.logicalName?.trim()) return col;
            const phys = lookupPhysicalName(glossary, col.logicalName);
            if (!phys) return col;
            return { ...col, physicalName: phys };
        }
        if (col.logicalName?.trim()) return col;
        if (!col.physicalName?.trim()) return col;
        const log = lookupLogicalName(glossary, col.physicalName);
        if (!log) return col;
        return { ...col, logicalName: log };
    });
}

export function applyGlossaryEntriesToModel(
    model: DesignModel,
    glossary: readonly GlossaryEntry[],
    entryIds: readonly string[],
    matchKey: GlossaryMatchKey,
): DesignModel {
    return {
        ...model,
        tables: applyGlossaryToTables(
            model.tables,
            glossary,
            entryIds,
            matchKey,
        ),
    };
}
