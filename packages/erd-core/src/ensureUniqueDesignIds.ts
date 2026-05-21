import type {
    DesignDocument,
    DesignModel,
    IndexModel,
    RelationshipModel,
    TableModel,
} from "./index";

function fallbackId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 문서 전역에서 쓰는 안정적인 id (`table-{uuid}` 등). */
export function createId(prefix: string): string {
    const suffix =
        typeof globalThis.crypto?.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : fallbackId();
    return `${prefix}-${suffix}`;
}

function remapColumnRefs(
    columnIdMap: Map<string, string>,
    columnId: string | undefined,
): string | undefined {
    if (!columnId) return columnId;
    return columnIdMap.get(columnId) ?? columnId;
}

function normalizeTableColumns(
    table: TableModel,
    usedColumnIds: Set<string>,
    columnIdMap: Map<string, string>,
): TableModel {
    const columns = table.columns.map((col) => {
        const oldId = col.id?.trim() || createId("col");
        let id = oldId;
        if (usedColumnIds.has(id)) {
            id = createId("col");
            columnIdMap.set(oldId, id);
        }
        usedColumnIds.add(id);
        return { ...col, id };
    });
    return {
        ...table,
        columns: columns.map((col) => ({
            ...col,
            referencesPrimaryColumnId: remapColumnRefs(
                columnIdMap,
                col.referencesPrimaryColumnId,
            ),
        })),
    };
}

function remapRelationships(
    relationships: RelationshipModel[],
    tableIdMap: Map<string, string>,
    columnIdMap: Map<string, string>,
): RelationshipModel[] {
    return relationships.map((rel) => ({
        ...rel,
        sourceTableId: tableIdMap.get(rel.sourceTableId) ?? rel.sourceTableId,
        targetTableId: tableIdMap.get(rel.targetTableId) ?? rel.targetTableId,
        sourceColumnId: remapColumnRefs(columnIdMap, rel.sourceColumnId),
        targetColumnId: remapColumnRefs(columnIdMap, rel.targetColumnId),
        originPkColumnId: remapColumnRefs(columnIdMap, rel.originPkColumnId),
    }));
}

function remapIndexes(
    indexes: IndexModel[],
    tableIdMap: Map<string, string>,
): IndexModel[] {
    return indexes.map((idx) => ({
        ...idx,
        tableId: tableIdMap.get(idx.tableId) ?? idx.tableId,
    }));
}

/**
 * 테이블·컬럼 id가 문서 전역에서 유일하도록 재발급한다.
 * Host import 등으로 `table-1`이 중복된 경우 React Flow 노드 충돌을 방지한다.
 */
export function ensureUniqueDesignIds(doc: DesignDocument): DesignDocument {
    const usedColumnIds = new Set<string>();
    const columnIdMap = new Map<string, string>();

    const usedTableIds = new Set<string>();
    const tableIdMap = new Map<string, string>();
    const oldTableIds: string[] = [];
    const nextTables: TableModel[] = [];

    for (const table of doc.model.tables) {
        const oldId = table.id?.trim() || createId("table");
        oldTableIds.push(oldId);
        let id = oldId;
        if (usedTableIds.has(id)) {
            id = createId("table");
        }
        usedTableIds.add(id);
        const duplicateOldCount = oldTableIds.filter((x) => x === oldId).length;
        if (oldId !== id && duplicateOldCount === 1) {
            tableIdMap.set(oldId, id);
        }
        nextTables.push(
            normalizeTableColumns({ ...table, id }, usedColumnIds, columnIdMap),
        );
    }

    const nodePositions: Record<string, { x: number; y: number }> = {};
    for (let i = 0; i < nextTables.length; i++) {
        const table = nextTables[i]!;
        const oldId = oldTableIds[i]!;
        nodePositions[table.id] =
            doc.layout.nodePositions[table.id] ??
            doc.layout.nodePositions[oldId] ?? {
                x: 60 + (i % 5) * 48,
                y: 60 + Math.floor(i / 5) * 48,
            };
    }

    const model: DesignModel = {
        ...doc.model,
        tables: nextTables,
        relationships: remapRelationships(
            doc.model.relationships,
            tableIdMap,
            columnIdMap,
        ),
        indexes: remapIndexes(doc.model.indexes, tableIdMap),
    };

    return {
        ...doc,
        model,
        layout: {
            ...doc.layout,
            nodePositions,
        },
    };
}
