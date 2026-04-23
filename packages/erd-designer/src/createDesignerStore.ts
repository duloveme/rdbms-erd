import {
    alignNodePositions,
    type CoreDbMetaOptions,
    createEmptyDesign,
    defaultPhysicalType,
    ColumnModel,
    DesignDocument,
    LogicalDataType,
    RdbmsDialect,
    RelationshipModel,
    TableModel,
} from "@rdbms-erd/core";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";

export type AlignType =
    | "left"
    | "h-center"
    | "right"
    | "top"
    | "v-center"
    | "bottom"
    | "h-gap"
    | "v-gap";

function shouldDeleteFkColumnByRelationship(
    rel: RelationshipModel,
    targetColumn: ColumnModel | undefined,
): boolean {
    return Boolean(
        rel.autoCreatedTargetColumn ||
        (targetColumn?.isForeignKey &&
            targetColumn.referencesPrimaryColumnId === rel.originPkColumnId),
    );
}

export interface DesignerState {
    doc: DesignDocument;
    setDoc: (doc: DesignDocument) => void;
    addTable: (table: TableModel, x: number, y: number) => void;
    removeTable: (tableId: string) => void;
    addRelationship: (rel: RelationshipModel) => void;
    removeRelationship: (relationshipId: string) => void;
    updateTable: (
        tableId: string,
        updater: (table: TableModel) => void,
    ) => void;
    setColumnLogicalType: (
        tableId: string,
        columnId: string,
        logicalType: LogicalDataType,
    ) => void;
    setColumnPhysicalType: (
        tableId: string,
        columnId: string,
        physicalType: string,
    ) => void;
    /** 논리 이름 변경. 물리 이름이 이전 논리 이름과 같았다면 새 논리 이름으로 동기화한다. */
    setColumnLogicalName: (
        tableId: string,
        columnId: string,
        logicalName: string,
    ) => void;
    /** 컬럼 물리 이름(식별자). DDL·노드 표시에 사용된다. */
    setColumnPhysicalName: (
        tableId: string,
        columnId: string,
        physicalName: string,
    ) => void;
    setNodePosition: (tableId: string, x: number, y: number) => void;
    setNodePositions: (
        positions: Record<string, { x: number; y: number }>,
    ) => void;
    alignSelected: (tableIds: string[], type: AlignType) => void;
    setTableMeta: (
        tableId: string,
        meta: {
            logicalName?: string;
            physicalName?: string;
            schemaName?: string | null;
            color?: string | null;
        },
    ) => void;
    /** 컬럼 배열 전체 교체(순서·추가·삭제). 해당 테이블을 참조하던 관계 중 사라진 컬럼은 제거된다. */
    setTableColumns: (tableId: string, columns: ColumnModel[]) => void;
    /** 캔버스에서 해당 관계선 숨김(`canvasLineHidden`). 표시만 바꾸는 툴과는 별개로 모델에 반영된다. */
    setRelationshipCanvasLineHidden: (
        relationshipId: string,
        hidden: boolean,
    ) => void;
    /** 관계 cardinality(1:1 / 1:N) 변경 */
    setRelationshipCardinality: (
        relationshipId: string,
        cardinality: "1:1" | "1:N",
    ) => void;
    /** 관계선 꺾임 비율(0~1) 변경 */
    setRelationshipLinePivotRatio: (
        relationshipId: string,
        ratio: number | undefined,
    ) => void;
    /** 관계선 출발점 세로 비율(0~1) 변경 */
    setRelationshipSourceLineRatio: (
        relationshipId: string,
        ratio: number,
    ) => void;
    /** 관계선 출발점 절대 Y(px) 변경 */
    setRelationshipSourceLineY: (relationshipId: string, y: number) => void;
    /** 선택된 테이블/관계선을 한 번에 삭제(Undo 1스텝 보장) */
    deleteSelection: (tableIds: string[], relationshipIds: string[]) => void;
}

export function createDesignerStore(
    options: {
        initialDialect?: RdbmsDialect;
        coreOptions?: CoreDbMetaOptions;
    } = {},
) {
    const initialDialect = options.initialDialect ?? "mssql";
    return create<DesignerState>()(
        temporal(
            immer((set) => ({
                doc: createEmptyDesign(initialDialect),
                setDoc: (doc) =>
                    set(() => {
                        return { doc };
                    }),
                addTable: (table, x, y) =>
                    set((state) => {
                        state.doc.model.tables.push(table);
                        state.doc.layout.nodePositions[table.id] = { x, y };
                    }),
                removeTable: (tableId) =>
                    set((state) => {
                        state.doc.model.tables = state.doc.model.tables.filter(
                            (t) => t.id !== tableId,
                        );
                        state.doc.model.relationships =
                            state.doc.model.relationships.filter(
                                (r) =>
                                    r.sourceTableId !== tableId &&
                                    r.targetTableId !== tableId,
                            );
                        state.doc.model.indexes =
                            state.doc.model.indexes.filter(
                                (i) => i.tableId !== tableId,
                            );
                        delete state.doc.layout.nodePositions[tableId];
                    }),
                addRelationship: (rel) =>
                    set((state) => {
                        state.doc.model.relationships.push(rel);
                    }),
                removeRelationship: (relationshipId) =>
                    set((state) => {
                        const rel = state.doc.model.relationships.find(
                            (r) => r.id === relationshipId,
                        );
                        if (rel?.targetColumnId) {
                            const targetTable = state.doc.model.tables.find(
                                (t) => t.id === rel.targetTableId,
                            );
                            if (targetTable) {
                                const targetColumn = targetTable.columns.find(
                                    (c) => c.id === rel.targetColumnId,
                                );
                                const usedByOthers =
                                    state.doc.model.relationships.some(
                                        (r) =>
                                            r.id !== relationshipId &&
                                            r.targetTableId ===
                                                rel.targetTableId &&
                                            r.targetColumnId ===
                                                rel.targetColumnId,
                                    );
                                const shouldDeleteFkColumn =
                                    !usedByOthers &&
                                    shouldDeleteFkColumnByRelationship(
                                        rel,
                                        targetColumn,
                                    );
                                if (shouldDeleteFkColumn) {
                                    targetTable.columns =
                                        targetTable.columns.filter(
                                            (c) => c.id !== rel.targetColumnId,
                                        );
                                }
                            }
                        }
                        state.doc.model.relationships =
                            state.doc.model.relationships.filter(
                                (r) => r.id !== relationshipId,
                            );
                    }),
                updateTable: (tableId, updater) =>
                    set((state) => {
                        const table = state.doc.model.tables.find(
                            (item) => item.id === tableId,
                        );
                        if (!table) return;
                        updater(table);
                    }),
                setColumnLogicalType: (tableId, columnId, logicalType) =>
                    set((state) => {
                        const table = state.doc.model.tables.find(
                            (t) => t.id === tableId,
                        );
                        const column = table?.columns.find(
                            (c) => c.id === columnId,
                        );
                        if (!column) return;
                        column.logicalType = logicalType;
                        column.physicalType = defaultPhysicalType(
                            state.doc.model.dialect,
                            logicalType,
                            options.coreOptions,
                        );
                    }),
                setColumnPhysicalType: (tableId, columnId, physicalType) =>
                    set((state) => {
                        const table = state.doc.model.tables.find(
                            (t) => t.id === tableId,
                        );
                        const column = table?.columns.find(
                            (c) => c.id === columnId,
                        );
                        if (!column) return;
                        column.physicalType = physicalType;
                    }),
                setColumnLogicalName: (tableId, columnId, logicalName) =>
                    set((state) => {
                        const table = state.doc.model.tables.find(
                            (t) => t.id === tableId,
                        );
                        const column = table?.columns.find(
                            (c) => c.id === columnId,
                        );
                        if (!column) return;
                        const prevLogical = column.logicalName;
                        column.logicalName = logicalName;
                        if (column.physicalName === prevLogical) {
                            column.physicalName = logicalName;
                        }
                    }),
                setColumnPhysicalName: (tableId, columnId, physicalName) =>
                    set((state) => {
                        const table = state.doc.model.tables.find(
                            (t) => t.id === tableId,
                        );
                        const column = table?.columns.find(
                            (c) => c.id === columnId,
                        );
                        if (!column) return;
                        column.physicalName = physicalName;
                    }),
                setNodePosition: (tableId, x, y) =>
                    set((state) => {
                        state.doc.layout.nodePositions[tableId] = { x, y };
                    }),
                setNodePositions: (positions) =>
                    set((state) => {
                        for (const [tableId, pos] of Object.entries(
                            positions,
                        )) {
                            state.doc.layout.nodePositions[tableId] = {
                                x: pos.x,
                                y: pos.y,
                            };
                        }
                    }),
                alignSelected: (tableIds, type) =>
                    set((state) => {
                        const updates = alignNodePositions(
                            tableIds,
                            state.doc.layout.nodePositions,
                            type,
                        );
                        for (const [id, pos] of Object.entries(updates)) {
                            state.doc.layout.nodePositions[id] = pos;
                        }
                    }),
                setTableMeta: (tableId, meta) =>
                    set((state) => {
                        const table = state.doc.model.tables.find(
                            (t) => t.id === tableId,
                        );
                        if (!table) return;
                        if (meta.logicalName !== undefined)
                            table.logicalName = meta.logicalName;
                        if (meta.physicalName !== undefined)
                            table.physicalName = meta.physicalName;
                        if (meta.schemaName !== undefined) {
                            if (
                                meta.schemaName === null ||
                                !meta.schemaName.trim()
                            )
                                delete table.schemaName;
                            else table.schemaName = meta.schemaName;
                        }
                        if (meta.color !== undefined) {
                            if (meta.color === null) delete table.color;
                            else table.color = meta.color;
                        }
                    }),
                setTableColumns: (tableId, columns) =>
                    set((state) => {
                        const table = state.doc.model.tables.find(
                            (t) => t.id === tableId,
                        );
                        if (!table) return;
                        const prevColumnsById = new Map(
                            table.columns.map((c) => [c.id, c]),
                        );
                        const colIds = new Set(columns.map((c) => c.id));
                        state.doc.model.relationships =
                            state.doc.model.relationships.filter((r) => {
                                if (
                                    r.sourceTableId === tableId &&
                                    r.sourceColumnId &&
                                    !colIds.has(r.sourceColumnId)
                                ) {
                                    return false;
                                }
                                if (
                                    r.targetTableId === tableId &&
                                    r.targetColumnId &&
                                    !colIds.has(r.targetColumnId)
                                ) {
                                    return false;
                                }
                                return true;
                            });
                        table.columns = columns;

                        // PK 원본 컬럼의 타입이 바뀌면 연결된 FK 컬럼 타입을 동기화한다.
                        for (const rel of state.doc.model.relationships) {
                            if (
                                rel.sourceTableId !== tableId ||
                                !rel.sourceColumnId ||
                                !rel.targetColumnId
                            )
                                continue;
                            const sourceCol = table.columns.find(
                                (c) => c.id === rel.sourceColumnId,
                            );
                            if (!sourceCol || !sourceCol.isPrimaryKey) continue;
                            const prevSource = prevColumnsById.get(
                                rel.sourceColumnId,
                            );
                            if (!prevSource) continue;
                            const typeChanged =
                                prevSource.logicalType !==
                                    sourceCol.logicalType ||
                                prevSource.physicalType !==
                                    sourceCol.physicalType;
                            if (!typeChanged) continue;

                            const targetTable = state.doc.model.tables.find(
                                (t) => t.id === rel.targetTableId,
                            );
                            const targetCol = targetTable?.columns.find(
                                (c) => c.id === rel.targetColumnId,
                            );
                            if (!targetCol) continue;
                            targetCol.logicalType = sourceCol.logicalType;
                            targetCol.physicalType = sourceCol.physicalType;
                        }
                    }),
                setRelationshipCanvasLineHidden: (relationshipId, hidden) =>
                    set((state) => {
                        const rel = state.doc.model.relationships.find(
                            (r) => r.id === relationshipId,
                        );
                        if (!rel) return;
                        if (hidden) rel.canvasLineHidden = true;
                        else delete rel.canvasLineHidden;
                    }),
                setRelationshipCardinality: (relationshipId, cardinality) =>
                    set((state) => {
                        const rel = state.doc.model.relationships.find(
                            (r) => r.id === relationshipId,
                        );
                        if (!rel) return;
                        rel.cardinality = cardinality;
                    }),
                setRelationshipLinePivotRatio: (relationshipId, ratio) =>
                    set((state) => {
                        const rel = state.doc.model.relationships.find(
                            (r) => r.id === relationshipId,
                        );
                        if (!rel) return;
                        if (ratio === undefined || !Number.isFinite(ratio)) {
                            rel.linePivotRatio = undefined;
                            return;
                        }
                        rel.linePivotRatio = Math.max(0, Math.min(1, ratio));
                    }),
                setRelationshipSourceLineRatio: (relationshipId, ratio) =>
                    set((state) => {
                        const rel = state.doc.model.relationships.find(
                            (r) => r.id === relationshipId,
                        );
                        if (!rel) return;
                        const normalized = Number.isFinite(ratio)
                            ? Math.max(0, Math.min(1, ratio))
                            : 0;
                        rel.sourceLineRatio = normalized;
                    }),
                setRelationshipSourceLineY: (relationshipId, y) =>
                    set((state) => {
                        const rel = state.doc.model.relationships.find(
                            (r) => r.id === relationshipId,
                        );
                        if (!rel) return;
                        const normalized = Number.isFinite(y)
                            ? Math.max(0, y)
                            : 0;
                        rel.sourceLineY = normalized;
                    }),
                deleteSelection: (tableIds, relationshipIds) =>
                    set((state) => {
                        const tableSet = new Set(tableIds);
                        const relSet = new Set(relationshipIds);
                        for (const rel of state.doc.model.relationships) {
                            if (
                                tableSet.has(rel.sourceTableId) ||
                                tableSet.has(rel.targetTableId)
                            ) {
                                relSet.add(rel.id);
                            }
                        }
                        for (const rel of state.doc.model.relationships) {
                            if (!relSet.has(rel.id) || !rel.targetColumnId)
                                continue;
                            if (tableSet.has(rel.targetTableId)) continue;
                            const targetTable = state.doc.model.tables.find(
                                (t) => t.id === rel.targetTableId,
                            );
                            if (!targetTable) continue;
                            const targetColumn = targetTable.columns.find(
                                (c) => c.id === rel.targetColumnId,
                            );
                            const usedByRemaining =
                                state.doc.model.relationships.some(
                                    (other) =>
                                        other.id !== rel.id &&
                                        !relSet.has(other.id) &&
                                        other.targetTableId ===
                                            rel.targetTableId &&
                                        other.targetColumnId ===
                                            rel.targetColumnId,
                                );
                            if (
                                !usedByRemaining &&
                                shouldDeleteFkColumnByRelationship(
                                    rel,
                                    targetColumn,
                                )
                            ) {
                                targetTable.columns =
                                    targetTable.columns.filter(
                                        (c) => c.id !== rel.targetColumnId,
                                    );
                            }
                        }
                        state.doc.model.relationships =
                            state.doc.model.relationships.filter(
                                (r) => !relSet.has(r.id),
                            );
                        state.doc.model.tables = state.doc.model.tables.filter(
                            (t) => !tableSet.has(t.id),
                        );
                        state.doc.model.indexes =
                            state.doc.model.indexes.filter(
                                (i) => !tableSet.has(i.tableId),
                            );
                        for (const tableId of tableSet) {
                            delete state.doc.layout.nodePositions[tableId];
                        }
                    }),
            })),
            {
                partialize: (state) => ({ doc: state.doc }),
            },
        ),
    );
}

export type DesignerStore = ReturnType<typeof createDesignerStore>;
