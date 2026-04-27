import type { DesignModel, RelationshipModel } from "@rdbms-erd/core";
import { isRelationshipLineRenderable } from "@rdbms-erd/core";
import type { Edge } from "@xyflow/react";

export type RelationshipEdgeData = {
    relationshipIds: string[];
    cardinality: "1:1" | "1:N";
    sourceLineRatio: number;
    sourceLineY: number;
    sourceAnchorMinY: number;
    sourceAnchorMaxY: number;
    linePivotRatio?: number;
    onLinePivotRatioChange?: (relationshipId: string, ratio: number) => void;
    onSourceLineRatioChange?: (relationshipId: string, ratio: number) => void;
};

export type RelationshipHandleSide = "left" | "right";
export const TABLE_RELATIONSHIP_SOURCE_HANDLE_LEFT_ID = "source-left";
export const TABLE_RELATIONSHIP_SOURCE_HANDLE_RIGHT_ID = "source-right";

/** Left target handle id for an FK column on the target table (see TableNode). */
export function targetFkColumnHandleId(
    columnId: string,
    side: RelationshipHandleSide,
): string {
    return `target-fk-${side}-${columnId}`;
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
    return (
        NODE_HEADER_PX + NODE_BODY_PAD_TOP + idx * NODE_ROW_PX + NODE_ROW_PX / 2
    );
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
    return (
        NODE_HEADER_PX +
        NODE_BODY_PAD_TOP +
        count * NODE_ROW_PX +
        NODE_BODY_PAD_BOTTOM
    );
}

/**
 * Target handle for an edge on the target table (FK column only).
 * Each relationship uses its own `targetColumnId` so multiple incoming edges
 * land on the correct FK row, including when the source table has a composite PK.
 */
export function resolveTargetFkHandleId(
    rel: RelationshipModel,
    model: DesignModel,
    side: RelationshipHandleSide,
): string | null {
    const targetTable = model.tables.find((t) => t.id === rel.targetTableId);
    if (!targetTable) return null;

    const i = fkColumnIndex(targetTable, rel.targetColumnId);
    if (i < 0) return null;
    const col = targetTable.columns[i];
    return col ? targetFkColumnHandleId(col.id, side) : null;
}

function resolveRelationshipSides(params: {
    sourcePos: { x: number; y: number };
    targetPos: { x: number; y: number };
    tableWidth: number;
}): {
    sourceSide: RelationshipHandleSide;
    targetSide: RelationshipHandleSide;
} {
    const { sourcePos, targetPos, tableWidth } = params;
    const srcLeft = sourcePos.x;
    const srcRight = sourcePos.x + tableWidth;
    const tgtLeft = targetPos.x;
    const tgtRight = targetPos.x + tableWidth;
    const overlaps = srcLeft < tgtRight && tgtLeft < srcRight;

    // 테이블이 수평으로 겹치면 source/target 모두 left 핸들을 사용한다.
    if (overlaps) {
        return { sourceSide: "left", targetSide: "left" };
    }
    if (targetPos.x >= sourcePos.x) {
        return { sourceSide: "right", targetSide: "left" };
    }
    // target이 source의 왼쪽에 있을 때, target.right ~ source.left 사이에
    // 꺾은선이 들어갈 최소 공간이 확보되면 target 우측으로 도착시킨다.
    const MIN_BEND_SPACE_PX = 16;
    const gap = srcLeft - tgtRight;
    if (gap >= MIN_BEND_SPACE_PX) {
        return { sourceSide: "left", targetSide: "right" };
    }
    return { sourceSide: "left", targetSide: "left" };
}

export function buildRelationshipFlowEdges(
    model: DesignModel,
    nodePositions: Record<string, { x: number; y: number }>,
    tableWidth: number,
    revealHiddenLines: boolean,
    options?: {
        onLinePivotRatioChange?: (
            relationshipId: string,
            ratio: number,
        ) => void;
        onSourceLineRatioChange?: (
            relationshipId: string,
            ratio: number,
        ) => void;
    },
): Edge<RelationshipEdgeData>[] {
    const edges: Edge<RelationshipEdgeData>[] = [];
    for (const rel of model.relationships) {
        if (!isRelationshipLineRenderable(rel, revealHiddenLines)) {
            continue;
        }
            const sourcePos = nodePositions[rel.sourceTableId] ?? { x: 60, y: 60 };
            const targetPos = nodePositions[rel.targetTableId] ?? { x: 60, y: 60 };
            const { sourceSide, targetSide } = resolveRelationshipSides({
                sourcePos,
                targetPos,
                tableWidth,
            });
            const targetHandle = resolveTargetFkHandleId(
                rel,
                model,
                targetSide,
            );
            if (!targetHandle) continue;
            const sourceTable = model.tables.find(
                (t) => t.id === rel.sourceTableId,
            );
            const sourceColumnCount = sourceTable?.columns.length ?? 0;
            const sourceAnchorMinY = tableTopPx();
            const sourceAnchorMaxY = tableBottomPx(sourceColumnCount);
            const sourceSpan = Math.max(
                1,
                sourceAnchorMaxY - sourceAnchorMinY,
            );
            const computedSourceLineY =
                rel.sourceLineY ??
                (typeof rel.sourceLineRatio === "number"
                    ? sourceAnchorMinY +
                      (sourceAnchorMaxY - sourceAnchorMinY) *
                          rel.sourceLineRatio
                    : defaultSourceLineY(sourceTable));
            const edge: Edge<RelationshipEdgeData> = {
                id: rel.id,
                source: rel.sourceTableId,
                target: rel.targetTableId,
                sourceHandle:
                    sourceSide === "right"
                        ? TABLE_RELATIONSHIP_SOURCE_HANDLE_RIGHT_ID
                        : TABLE_RELATIONSHIP_SOURCE_HANDLE_LEFT_ID,
                targetHandle,
                style: {
                    stroke: "#94a3b8",
                    strokeWidth: 1.6,
                },
                type: "relationship",
                data: {
                    relationshipIds: [rel.id],
                    cardinality: rel.cardinality ?? "1:N",
                    sourceLineRatio:
                        typeof rel.sourceLineRatio === "number"
                            ? rel.sourceLineRatio
                            : (computedSourceLineY - sourceAnchorMinY) /
                              sourceSpan,
                    sourceLineY: computedSourceLineY,
                    sourceAnchorMinY,
                    sourceAnchorMaxY,
                    linePivotRatio: rel.linePivotRatio,
                    onLinePivotRatioChange: options?.onLinePivotRatioChange,
                    onSourceLineRatioChange:
                        options?.onSourceLineRatioChange,
                },
            };
            edges.push(edge);
    }
    return edges;
}
