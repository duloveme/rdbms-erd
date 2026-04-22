import type { DesignModel, RelationshipModel } from "@rdbms-erd/core";
import { isRelationshipLineRenderable } from "@rdbms-erd/core";
import type { Edge } from "@xyflow/react";

export type RelationshipEdgeData = {
    relationshipIds: string[];
    cardinality: "1:1" | "1:N";
    sourceLineY: number;
    sourceAnchorMinY: number;
    sourceAnchorMaxY: number;
    linePivotRatio: number;
    onLinePivotRatioChange?: (relationshipId: string, ratio: number) => void;
    onSourceLineYChange?: (relationshipId: string, y: number) => void;
};

/** Single source handle on the right of each table node; all outgoing FK edges attach here. */
export const TABLE_RELATIONSHIP_SOURCE_HANDLE_ID = "source";

/** Left target handle id for an FK column on the target table (see TableNode). */
export function targetFkColumnHandleId(columnId: string): string {
    return `target-fk-${columnId}`;
}

function fkColumnIndex(
    targetTable: DesignModel["tables"][number],
    columnId: string | undefined,
): number {
    if (!columnId) return -1;
    const i = targetTable.columns.findIndex((c) => c.id === columnId);
    if (i < 0) return -1;
    return targetTable.columns[i]?.isForeignKey ? i : -1;
}

const NODE_HEADER_PX = 39;
const NODE_BODY_PAD_TOP = 2;
const NODE_BODY_PAD_BOTTOM = 4;
const NODE_ROW_PX = 36;

function rowCenterTopPx(rowIndex: number, columnCount: number): number {
    if (columnCount <= 0) return NODE_HEADER_PX + 18;
    const idx = Math.max(0, Math.min(rowIndex, columnCount - 1));
    return NODE_HEADER_PX + NODE_BODY_PAD_TOP + idx * NODE_ROW_PX + NODE_ROW_PX / 2;
}

function defaultSourceLineY(
    sourceTable: DesignModel["tables"][number] | undefined,
): number {
    if (!sourceTable) return rowCenterTopPx(0, 1);
    const pkIndex = sourceTable.columns.findIndex((c) => c.isPrimaryKey);
    const rowIndex = pkIndex >= 0 ? pkIndex : 0;
    return rowCenterTopPx(rowIndex, Math.max(1, sourceTable.columns.length));
}

function tableTopPx(): number {
    return 0;
}

function tableBottomPx(columnCount: number): number {
    const count = Math.max(1, columnCount);
    return NODE_HEADER_PX + NODE_BODY_PAD_TOP + count * NODE_ROW_PX + NODE_BODY_PAD_BOTTOM;
}

/**
 * Target handle for an edge on the target table (FK column only).
 * Each relationship uses its own `targetColumnId` so multiple incoming edges
 * land on the correct FK row, including when the source table has a composite PK.
 */
export function resolveTargetFkHandleId(
    rel: RelationshipModel,
    model: DesignModel,
): string | null {
    const targetTable = model.tables.find((t) => t.id === rel.targetTableId);
    if (!targetTable) return null;

    const i = fkColumnIndex(targetTable, rel.targetColumnId);
    if (i < 0) return null;
    const col = targetTable.columns[i];
    return col ? targetFkColumnHandleId(col.id) : null;
}

export function buildRelationshipFlowEdges(
    model: DesignModel,
    revealHiddenLines: boolean,
    options?: {
        onLinePivotRatioChange?: (
            relationshipId: string,
            ratio: number,
        ) => void;
        onSourceLineYChange?: (
            relationshipId: string,
            y: number,
        ) => void;
    },
): Edge<RelationshipEdgeData>[] {
    return model.relationships
        .filter((rel) =>
            isRelationshipLineRenderable(rel, revealHiddenLines),
        )
        .map((rel) => {
            const targetHandle = resolveTargetFkHandleId(rel, model);
            if (!targetHandle) return null;
            const sourceTable = model.tables.find((t) => t.id === rel.sourceTableId);
            const sourceColumnCount = sourceTable?.columns.length ?? 0;
            const sourceAnchorMinY = tableTopPx();
            const sourceAnchorMaxY = tableBottomPx(sourceColumnCount);
            return {
                id: rel.id,
                source: rel.sourceTableId,
                target: rel.targetTableId,
                sourceHandle: TABLE_RELATIONSHIP_SOURCE_HANDLE_ID,
                targetHandle,
                style: {
                    stroke: "#94a3b8",
                    strokeWidth: 1.6,
                },
                type: "relationship",
                data: {
                    relationshipIds: [rel.id],
                    cardinality: rel.cardinality ?? "1:N",
                    sourceLineY:
                        rel.sourceLineY ??
                        (typeof rel.sourceLineRatio === "number"
                            ? sourceAnchorMinY +
                              (sourceAnchorMaxY - sourceAnchorMinY) *
                                  rel.sourceLineRatio
                            : defaultSourceLineY(sourceTable)),
                    sourceAnchorMinY,
                    sourceAnchorMaxY,
                    linePivotRatio: rel.linePivotRatio ?? 0.5,
                    onLinePivotRatioChange: options?.onLinePivotRatioChange,
                    onSourceLineYChange: options?.onSourceLineYChange,
                },
            } satisfies Edge<RelationshipEdgeData>;
        })
        .filter((e): e is Edge<RelationshipEdgeData> => e != null);
}
