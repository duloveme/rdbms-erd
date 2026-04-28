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

/** 테이블 노드에서 컬럼 행(rowIndex)의 세로 중앙까지의 top 기준 px (TableNode와 동일 기하). */
export function relationshipRowCenterTopPx(
    rowIndex: number,
    columnCount: number,
): number {
    if (columnCount <= 0) return NODE_HEADER_PX + 18;
    const idx = Math.max(0, Math.min(rowIndex, columnCount - 1));
    return (
        NODE_HEADER_PX + NODE_BODY_PAD_TOP + idx * NODE_ROW_PX + NODE_ROW_PX / 2
    );
}

function defaultSourceLineY(
    sourceTable: DesignModel["tables"][number] | undefined,
): number {
    if (!sourceTable) return relationshipRowCenterTopPx(0, 1);
    const pkIndex = sourceTable.columns.findIndex((c) => c.isPrimaryKey);
    const rowIndex = pkIndex >= 0 ? pkIndex : 0;
    return relationshipRowCenterTopPx(
        rowIndex,
        Math.max(1, sourceTable.columns.length),
    );
}

/** 지정한 소스 컬럼 행 기준 출발 세로 위치(px). 복합 FK 시 첫 PK 컬럼 id를 넘긴다. */
export function sourceLineYForSourceColumnRow(
    sourceTable: DesignModel["tables"][number] | undefined,
    sourceColumnId: string | undefined,
): number {
    if (!sourceTable) return relationshipRowCenterTopPx(0, 1);
    if (!sourceColumnId) return defaultSourceLineY(sourceTable);
    const idx = sourceTable.columns.findIndex((c) => c.id === sourceColumnId);
    const rowIndex = idx >= 0 ? idx : 0;
    return relationshipRowCenterTopPx(
        rowIndex,
        Math.max(1, sourceTable.columns.length),
    );
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

function groupMembersOrdered(
    model: DesignModel,
    groupId: string,
): RelationshipModel[] {
    return model.relationships.filter((r) => r.relationshipGroupId === groupId);
}

/**
 * Target handle for an edge on the target table (FK column only).
 * 복합 FK 그룹은 `primary` 관계의 `targetColumnId`(첫 FK 컬럼)에 맞춘다.
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

    if (overlaps) {
        return { sourceSide: "left", targetSide: "left" };
    }
    if (targetPos.x >= sourcePos.x) {
        return { sourceSide: "right", targetSide: "left" };
    }
    const MIN_BEND_SPACE_PX = 16;
    const gap = srcLeft - tgtRight;
    if (gap >= MIN_BEND_SPACE_PX) {
        return { sourceSide: "left", targetSide: "right" };
    }
    return { sourceSide: "left", targetSide: "left" };
}

function pushEdgeForPrimary(
    model: DesignModel,
    primary: RelationshipModel,
    relationshipIds: string[],
    nodePositions: Record<string, { x: number; y: number }>,
    tableWidth: number,
    revealHiddenLines: boolean,
    edges: Edge<RelationshipEdgeData>[],
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
): void {
    if (!isRelationshipLineRenderable(primary, revealHiddenLines)) {
        return;
    }
    const sourcePos = nodePositions[primary.sourceTableId] ?? { x: 60, y: 60 };
    const targetPos = nodePositions[primary.targetTableId] ?? { x: 60, y: 60 };
    const { sourceSide, targetSide } = resolveRelationshipSides({
        sourcePos,
        targetPos,
        tableWidth,
    });
    const targetHandle = resolveTargetFkHandleId(primary, model, targetSide);
    if (!targetHandle) return;
    const sourceTable = model.tables.find((t) => t.id === primary.sourceTableId);
    const sourceColumnCount = sourceTable?.columns.length ?? 0;
    const sourceAnchorMinY = tableTopPx();
    const sourceAnchorMaxY = tableBottomPx(sourceColumnCount);
    const sourceSpan = Math.max(1, sourceAnchorMaxY - sourceAnchorMinY);
    const computedSourceLineY =
        primary.sourceLineY ??
        (typeof primary.sourceLineRatio === "number"
            ? sourceAnchorMinY +
              (sourceAnchorMaxY - sourceAnchorMinY) * primary.sourceLineRatio
            : defaultSourceLineY(sourceTable));
    const edge: Edge<RelationshipEdgeData> = {
        id: primary.id,
        source: primary.sourceTableId,
        target: primary.targetTableId,
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
            relationshipIds,
            cardinality: primary.cardinality ?? "1:N",
            sourceLineRatio:
                typeof primary.sourceLineRatio === "number"
                    ? primary.sourceLineRatio
                    : (computedSourceLineY - sourceAnchorMinY) / sourceSpan,
            sourceLineY: computedSourceLineY,
            sourceAnchorMinY,
            sourceAnchorMaxY,
            linePivotRatio: primary.linePivotRatio,
            onLinePivotRatioChange: options?.onLinePivotRatioChange,
            onSourceLineRatioChange: options?.onSourceLineRatioChange,
        },
    };
    edges.push(edge);
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
    const emittedGroup = new Set<string>();

    for (const rel of model.relationships) {
        const gid = rel.relationshipGroupId;
        if (gid) {
            const members = groupMembersOrdered(model, gid);
            if (members.length > 1) {
                if (emittedGroup.has(gid)) continue;
                emittedGroup.add(gid);
                const primary = members[0];
                if (!primary) continue;
                pushEdgeForPrimary(
                    model,
                    primary,
                    members.map((m) => m.id),
                    nodePositions,
                    tableWidth,
                    revealHiddenLines,
                    edges,
                    options,
                );
                continue;
            }
        }
        pushEdgeForPrimary(
            model,
            rel,
            [rel.id],
            nodePositions,
            tableWidth,
            revealHiddenLines,
            edges,
            options,
        );
    }
    return edges;
}
