"use client";

import "./designer.css";
import "@xyflow/react/dist/style.css";
import {
    applyEdgeChanges,
    applyNodeChanges,
    BaseEdge,
    Background,
    Connection,
    Controls,
    Edge,
    EdgeChange,
    Handle,
    MiniMap,
    Node,
    NodeChange,
    NodeProps,
    Position,
    ReactFlow,
    ReactFlowProvider,
    type EdgeMouseHandler,
    type EdgeProps,
    type OnConnectEnd,
    type OnConnectStart,
    type ReactFlowInstance,
    useUpdateNodeInternals,
} from "@xyflow/react";
import {
    convertDesignDialect,
    createColumn,
    createEmptyDesign,
    defaultDbMetaAdapter,
    type DdlGeneratorHook,
    type DialectMetaJson,
    type DbMetaAdapter,
    DesignDocument,
    generateDdl,
    generateDdlForSelection,
    LogicalDataType,
    RdbmsDialect,
    resolveDialectMetas,
    serializeDesign,
    type RelationshipModel,
    TableModel,
} from "@rdbms-erd/core";
import {
    AlignHorizontalJustifyCenter,
    AlignHorizontalJustifyEnd,
    AlignHorizontalJustifyStart,
    AlignHorizontalSpaceBetween,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    AlignVerticalJustifyStart,
    AlignVerticalSpaceBetween,
    ClipboardPaste,
    Copy,
    Eye,
    EyeOff,
    FileDown,
    FileCode,
    FilePlus,
    FileImage,
    KeyRound,
    Link2,
    Pencil,
    Menu,
    Moon,
    Redo2,
    RefreshCw,
    Save,
    SquareDashedMousePointer,
    Table2,
    Trash2,
    Undo2,
    Sun,
    ZoomIn,
} from "lucide-react";
import { toBlob } from "html-to-image";
import { jsPDF } from "jspdf";
import React, {
    forwardRef,
    memo,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import { useStore } from "zustand";
import { createDesignerStore, type AlignType } from "./createDesignerStore";
import { createId } from "./id";
import { ErdI18nProvider, useErdI18n } from "./i18n/I18nContext";
import type { I18nKey, I18nVars } from "./i18n/types";
import {
    TABLE_RELATIONSHIP_SOURCE_HANDLE_LEFT_ID,
    TABLE_RELATIONSHIP_SOURCE_HANDLE_RIGHT_ID,
    buildRelationshipFlowEdges,
    targetFkColumnHandleId,
    type RelationshipEdgeData,
} from "./relationshipEdges";
import { TableEditDialog } from "./TableEditDialog";

export type CanvasDisplayMode = "logical" | "physical";
export type DesignerThemeMode = "light" | "dark";

export type CreateTableRequestPayload = {
    flowX: number;
    flowY: number;
    screenX: number;
    screenY: number;
    sourceTableId?: string;
    sourceColumnId?: string;
    sourcePrimaryColumnIds?: string[];
};

type InternalCreateTableContext = {
    mode: "toolbar" | "edge-drop";
    flowX?: number;
    flowY?: number;
    sourceTableId?: string;
    sourcePrimaryColumnIds?: string[];
};

interface TableNodeData extends Record<string, unknown> {
    table: TableModel;
    tableWidth: number;
    compact: boolean;
    displayMode: CanvasDisplayMode;
    physicalTitle?: string;
    onEditTable: (tableId: string) => void;
    /** 선택된 관계선의 양끝 테이블 강조(테이블 선택과 별개) */
    relationshipEndpointHighlight?: boolean;
}

type ClipboardTableBundle = {
    marker: "rdbms-erd/table-bundle";
    version: 1;
    tables: TableModel[];
    positions: Record<string, { x: number; y: number }>;
    relationships: DesignDocument["model"]["relationships"];
};

type RelationshipRouteInfo = {
    path: string;
    pivotHandleX: number;
    pivotHandleY: number;
    primaryAxis: "x" | "y";
};

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0.5;
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
}

function lerp(a: number, b: number, ratio: number): number {
    return a + (b - a) * ratio;
}

const REL_OUTER_MIN = 80;
const REL_OUTER_MAX = 260;
const REL_SAME_SIDE_OUTER_MAX = 2000;
const REL_INNER_MARGIN = 12;
const REL_MIN_INNER_SPAN = 18;
const REL_MIN_SOURCE_DEPART = 32;
const REL_MIN_TARGET_APPROACH = 32;

function horizontalDetourRange(params: {
    sourceX: number;
    targetX: number;
    sourcePosition: Position;
    targetPosition: Position;
}): { min: number; max: number } {
    const { sourceX, targetX, sourcePosition, targetPosition } = params;
    const sameSide = sourcePosition === targetPosition;
    if (sameSide) {
        if (sourcePosition === Position.Left) {
            const maxDetour = Math.min(
                sourceX - REL_MIN_SOURCE_DEPART,
                targetX - REL_MIN_TARGET_APPROACH,
            );
            const minDetour =
                Math.min(sourceX, targetX) - REL_SAME_SIDE_OUTER_MAX;
            if (minDetour < maxDetour) {
                return { min: minDetour, max: maxDetour };
            }
            return { min: maxDetour, max: maxDetour };
        }
        const minDetour = Math.max(
            sourceX + REL_MIN_SOURCE_DEPART,
            targetX + REL_MIN_TARGET_APPROACH,
        );
        const maxDetour = Math.max(sourceX, targetX) + REL_SAME_SIDE_OUTER_MAX;
        if (minDetour < maxDetour) {
            return { min: minDetour, max: maxDetour };
        }
        return { min: minDetour, max: minDetour };
    }
    if (sourcePosition === Position.Right && targetPosition === Position.Left) {
        // 반대편 테이블 사이에서 source 출발/target 진입 최소 길이를 우선 보장한다.
        const minDepart = Math.max(REL_INNER_MARGIN, REL_MIN_SOURCE_DEPART);
        const minApproach = Math.max(
            REL_INNER_MARGIN,
            REL_MIN_TARGET_APPROACH,
        );
        const innerMin = sourceX + minDepart;
        const innerMax = targetX - minApproach;
        if (innerMax - innerMin >= REL_MIN_INNER_SPAN)
            return { min: innerMin, max: innerMax };
        // 공간이 부족하면 중앙에 고정해 양쪽 길이를 최대한 균형 있게 확보한다.
        const corridorMin = sourceX + REL_INNER_MARGIN;
        const corridorMax = targetX - REL_INNER_MARGIN;
        if (corridorMax > corridorMin) {
            const center = (corridorMin + corridorMax) / 2;
            return { min: center, max: center };
        }
    }
    if (sourcePosition === Position.Left && targetPosition === Position.Right) {
        const minDepart = Math.max(REL_INNER_MARGIN, REL_MIN_SOURCE_DEPART);
        const minApproach = Math.max(
            REL_INNER_MARGIN,
            REL_MIN_TARGET_APPROACH,
        );
        const innerMin = targetX + minApproach;
        const innerMax = sourceX - minDepart;
        if (innerMax - innerMin >= REL_MIN_INNER_SPAN)
            return { min: innerMin, max: innerMax };
        const corridorMin = targetX + REL_INNER_MARGIN;
        const corridorMax = sourceX - REL_INNER_MARGIN;
        if (corridorMax > corridorMin) {
            const center = (corridorMin + corridorMax) / 2;
            return { min: center, max: center };
        }
    }
    if (sourcePosition === Position.Left) {
        return { min: sourceX - REL_OUTER_MAX, max: sourceX - REL_OUTER_MIN };
    }
    return { min: sourceX + REL_OUTER_MIN, max: sourceX + REL_OUTER_MAX };
}

function defaultUndefinedDetourX(params: {
    sourceX: number;
    targetX: number;
    sourcePosition: Position;
    targetPosition: Position;
}): number {
    const { sourceX, targetX, sourcePosition, targetPosition } = params;
    if (sourcePosition === targetPosition) {
        if (sourcePosition === Position.Left) {
            return Math.min(
                sourceX - REL_MIN_SOURCE_DEPART,
                targetX - REL_MIN_TARGET_APPROACH,
            );
        }
        return Math.max(
            sourceX + REL_MIN_SOURCE_DEPART,
            targetX + REL_MIN_TARGET_APPROACH,
        );
    }
    if (sourcePosition === Position.Right && targetPosition === Position.Left) {
        const minX = sourceX + REL_MIN_SOURCE_DEPART;
        const maxX = targetX - REL_MIN_TARGET_APPROACH;
        if (minX <= maxX) return (minX + maxX) / 2;
        return minX;
    }
    if (sourcePosition === Position.Left && targetPosition === Position.Right) {
        const minX = targetX + REL_MIN_TARGET_APPROACH;
        const maxX = sourceX - REL_MIN_SOURCE_DEPART;
        if (minX <= maxX) return (minX + maxX) / 2;
        return maxX;
    }
    return (sourceX + targetX) / 2;
}

function buildRelationshipRouteInfo(params: {
    sourceX: number;
    sourceY: number;
    sourcePosition: Position;
    targetX: number;
    targetY: number;
    targetPosition: Position;
    ratio: number | undefined;
}): RelationshipRouteInfo {
    const {
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        ratio,
    } = params;
    if (targetPosition === Position.Left || targetPosition === Position.Right) {
        const range = horizontalDetourRange({
            sourceX,
            targetX,
            sourcePosition,
            targetPosition,
        });
        const sameSide = sourcePosition === targetPosition;
        const normalized =
            typeof ratio === "number" && Number.isFinite(ratio)
                ? clamp01(ratio)
                : 0.5;
        const detourX =
            ratio === undefined && sameSide
                ? defaultUndefinedDetourX({
                      sourceX,
                      targetX,
                      sourcePosition,
                      targetPosition,
                  })
                : ratio === undefined
                  ? defaultUndefinedDetourX({
                        sourceX,
                        targetX,
                        sourcePosition,
                        targetPosition,
                    })
                : lerp(range.min, range.max, normalized);
        return {
            path: `M ${sourceX} ${sourceY} L ${detourX} ${sourceY} L ${detourX} ${targetY} L ${targetX} ${targetY}`,
            pivotHandleX: detourX,
            pivotHandleY: (sourceY + targetY) / 2,
            primaryAxis: "x",
        };
    }
    const normalized =
        typeof ratio === "number" && Number.isFinite(ratio)
            ? clamp01(ratio)
            : 0.5;
    const pivotY = lerp(sourceY, targetY, normalized);
    return {
        path: `M ${sourceX} ${sourceY} L ${sourceX} ${pivotY} L ${targetX} ${pivotY} L ${targetX} ${targetY}`,
        pivotHandleX: (sourceX + targetX) / 2,
        pivotHandleY: pivotY,
        primaryAxis: "y",
    };
}

type RelationshipEdgeComponentProps = EdgeProps & {
    className?: string;
};

function RelationshipEdge({
    id,
    sourceX,
    sourcePosition,
    sourceY,
    targetX,
    targetY,
    targetPosition,
    style,
    className,
    data,
    selected,
}: RelationshipEdgeComponentProps) {
    const SOURCE_HANDLE_OUTSET_PX = 6;
    const edgeData = data as RelationshipEdgeData | undefined;
    const relationshipId = edgeData?.relationshipIds?.[0];
    const sourceAnchorMinY = edgeData?.sourceAnchorMinY ?? sourceY;
    const sourceAnchorMaxY = edgeData?.sourceAnchorMaxY ?? sourceY;
    const sourceTableTopY = sourceY - HANDLE_TOP;
    const sourceLineY = Number.isFinite(edgeData?.sourceLineY)
        ? Number(edgeData?.sourceLineY)
        : HANDLE_TOP;
    const localSourceY = Math.max(
        sourceAnchorMinY,
        Math.min(sourceAnchorMaxY, sourceLineY),
    );
    const effectiveSourceY = sourceTableTopY + localSourceY;
    const sourceBorderX =
        sourcePosition === Position.Left
            ? sourceX + SOURCE_HANDLE_OUTSET_PX
            : sourceX - SOURCE_HANDLE_OUTSET_PX;
    const routeInfo = buildRelationshipRouteInfo({
        sourceX: sourceBorderX,
        sourceY: effectiveSourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        ratio: edgeData?.linePivotRatio,
    });
    const path = routeInfo.path;
    const cardinality = edgeData?.cardinality ?? "1:N";
    const onLinePivotRatioChange = edgeData?.onLinePivotRatioChange;
    const onSourceLineRatioChange = edgeData?.onSourceLineRatioChange;
    // 끝단 표식은 "타깃으로 진입하는 방향" 기준으로 계산한다.
    const [ux, uy] =
        targetPosition === Position.Left
            ? [1, 0]
            : targetPosition === Position.Right
              ? [-1, 0]
              : targetPosition === Position.Top
                ? [0, 1]
                : targetPosition === Position.Bottom
                  ? [0, -1]
                  : (() => {
                        const dx = targetX - sourceBorderX;
                        const dy = targetY - effectiveSourceY;
                        const len = Math.hypot(dx, dy) || 1;
                        return [dx / len, dy / len] as const;
                    })();
    const px = -uy;
    const py = ux;
    const stroke = (style?.stroke as string) ?? "#94a3b8";
    const strokeWidth = Number(style?.strokeWidth ?? 1.6);
    const elevated = className?.includes("erd-edge-elevated") ?? false;
    const markStroke = elevated ? "#dc2626" : stroke;
    const barHalf = 5;
    const bar1x = targetX - ux * 18;
    const bar1y = targetY - uy * 18;
    const bar1 = `M ${bar1x - px * barHalf} ${bar1y - py * barHalf} L ${bar1x + px * barHalf} ${bar1y + py * barHalf}`;
    const symbolPath =
        cardinality === "1:1"
            ? (() => {
                  // 1:N과 동일하게 "세로선(바)"은 1개만 두고, 뒤쪽은 단일 선으로 표현한다.
                  const ox = targetX - ux * 11;
                  const oy = targetY - uy * 11;
                  const one = `M ${ox} ${oy} L ${targetX} ${targetY}`;
                  return `${bar1} ${one}`;
              })()
            : (() => {
                  const ox = targetX - ux * 11;
                  const oy = targetY - uy * 11;
                  const upx = targetX + px * 6;
                  const upy = targetY + py * 6;
                  const midx = targetX;
                  const midy = targetY;
                  const downx = targetX - px * 6;
                  const downy = targetY - py * 6;
                  const crow = `M ${ox} ${oy} L ${upx} ${upy} M ${ox} ${oy} L ${midx} ${midy} M ${ox} ${oy} L ${downx} ${downy}`;
                  return `${bar1} ${crow}`;
              })();

    const onPivotPointerDown = useCallback(
        (e: React.PointerEvent<SVGCircleElement>) => {
            if (!relationshipId || !onLinePivotRatioChange) return;
            e.preventDefault();
            e.stopPropagation();
            const svg = e.currentTarget.ownerSVGElement;
            if (!svg) return;

            const toSvgPoint = (
                clientX: number,
                clientY: number,
            ): { x: number; y: number } | null => {
                const matrix = svg.getScreenCTM();
                if (!matrix) return null;
                const point = svg.createSVGPoint();
                point.x = clientX;
                point.y = clientY;
                const transformed = point.matrixTransform(matrix.inverse());
                return { x: transformed.x, y: transformed.y };
            };

            const updateRatio = (clientX: number, clientY: number) => {
                const point = toSvgPoint(clientX, clientY);
                if (!point) return;
                if (routeInfo.primaryAxis === "x") {
                    const range = horizontalDetourRange({
                        sourceX: sourceBorderX,
                        targetX,
                        sourcePosition,
                        targetPosition,
                    });
                    const width = range.max - range.min;
                    if (Math.abs(width) < 1e-6) return;
                    let next = clamp01((point.x - range.min) / width);
                    const nextDetourX = lerp(range.min, range.max, next);
                    if (
                        targetPosition === Position.Left &&
                        nextDetourX >= targetX
                    ) {
                        // target left를 넘어가면 현재 X는 무효화하고 중앙으로 재정렬한다.
                        const centerX = (sourceBorderX + targetX) / 2;
                        next = clamp01((centerX - range.min) / width);
                    }
                    onLinePivotRatioChange(relationshipId, next);
                    return;
                }
                const height = targetY - effectiveSourceY;
                if (Math.abs(height) < 1e-6) return;
                const next = clamp01((point.y - effectiveSourceY) / height);
                onLinePivotRatioChange(relationshipId, next);
            };

            const handleMove = (event: PointerEvent) => {
                event.preventDefault();
                updateRatio(event.clientX, event.clientY);
            };
            const handleUp = () => {
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", handleUp);
            };

            window.addEventListener("pointermove", handleMove);
            window.addEventListener("pointerup", handleUp);
            updateRatio(e.clientX, e.clientY);
        },
        [
            onLinePivotRatioChange,
            relationshipId,
            routeInfo.primaryAxis,
            sourceBorderX,
            effectiveSourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
        ],
    );

    const onSourcePointerDown = useCallback(
        (e: React.PointerEvent<SVGCircleElement>) => {
            if (!relationshipId || !onSourceLineRatioChange) return;
            e.preventDefault();
            e.stopPropagation();
            const svg = e.currentTarget.ownerSVGElement;
            if (!svg) return;

            const toSvgPoint = (
                clientX: number,
                clientY: number,
            ): { x: number; y: number } | null => {
                const matrix = svg.getScreenCTM();
                if (!matrix) return null;
                const point = svg.createSVGPoint();
                point.x = clientX;
                point.y = clientY;
                const transformed = point.matrixTransform(matrix.inverse());
                return { x: transformed.x, y: transformed.y };
            };

            const updateRatio = (clientX: number, clientY: number) => {
                const point = toSvgPoint(clientX, clientY);
                if (!point) return;
                const next = Math.max(
                    sourceAnchorMinY,
                    Math.min(sourceAnchorMaxY, point.y - sourceTableTopY),
                );
                const span = Math.max(
                    1,
                    sourceAnchorMaxY - sourceAnchorMinY,
                );
                const ratio = clamp01((next - sourceAnchorMinY) / span);
                onSourceLineRatioChange(relationshipId, ratio);
            };

            const handleMove = (event: PointerEvent) => {
                event.preventDefault();
                updateRatio(event.clientX, event.clientY);
            };
            const handleUp = () => {
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", handleUp);
            };
            window.addEventListener("pointermove", handleMove);
            window.addEventListener("pointerup", handleUp);
            updateRatio(e.clientX, e.clientY);
        },
        [
            onSourceLineRatioChange,
            relationshipId,
            sourceAnchorMaxY,
            sourceAnchorMinY,
            sourceTableTopY,
        ],
    );

    return (
        <g className={className}>
            <BaseEdge id={id} path={path} style={style} />
            <path
                d={symbolPath}
                fill="none"
                stroke={markStroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
            />
            {selected && relationshipId && onLinePivotRatioChange ? (
                <circle
                    className="erd-edge-pivot-handle"
                    cx={routeInfo.pivotHandleX}
                    cy={routeInfo.pivotHandleY}
                    r={6}
                    style={{
                        cursor:
                            routeInfo.primaryAxis === "x"
                                ? "ew-resize"
                                : "ns-resize",
                    }}
                    onPointerDown={onPivotPointerDown}
                />
            ) : null}
            {selected && relationshipId && onSourceLineRatioChange ? (
                <circle
                    className="erd-edge-source-handle"
                    cx={sourceBorderX}
                    cy={effectiveSourceY}
                    r={6}
                    style={{ cursor: "ns-resize" }}
                    onPointerDown={onSourcePointerDown}
                />
            ) : null}
        </g>
    );
}

const HANDLE_TOP = 12;
/** Approximate layout of table node body for left handle Y (aligns with first column row center). */
const NODE_HEADER_PX = 39;
const NODE_BODY_PAD_TOP = 2;
const NODE_ROW_PX = 36;

function targetRowCenterTopPx(rowIndex: number, columnCount: number): number {
    if (columnCount <= 0) return NODE_HEADER_PX + 18;
    const idx = Math.max(0, Math.min(rowIndex, columnCount - 1));
    return (
        NODE_HEADER_PX + NODE_BODY_PAD_TOP + idx * NODE_ROW_PX + NODE_ROW_PX / 2
    );
}

function parseHexColor(
    input: string,
): { r: number; g: number; b: number } | null {
    const hex = input.trim();
    const value = hex.startsWith("#") ? hex.slice(1) : hex;
    if (![3, 6].includes(value.length) || !/^[0-9a-fA-F]+$/.test(value))
        return null;
    const full =
        value.length === 3
            ? value
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : value;
    const num = Number.parseInt(full, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function relativeLuminanceChannel(v: number): number {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function wcagContrastRatio(l1: number, l2: number): number {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function getHeaderTextColor(background: string): "#0f172a" | "#ffffff" {
    const rgb = parseHexColor(background);
    if (!rgb) return "#0f172a";
    const bgL =
        0.2126 * relativeLuminanceChannel(rgb.r) +
        0.7152 * relativeLuminanceChannel(rgb.g) +
        0.0722 * relativeLuminanceChannel(rgb.b);
    const contrastWithBlack = wcagContrastRatio(bgL, 0);
    const contrastWithWhite = wcagContrastRatio(bgL, 1);
    return contrastWithWhite > contrastWithBlack ? "#ffffff" : "#0f172a";
}

const TableNode = memo(function TableNode({
    data,
    selected,
}: NodeProps<Node<TableNodeData>>) {
    const { t } = useErdI18n();
    const updateNodeInternals = useUpdateNodeInternals();
    const formatPhysicalTableName = useCallback((table: TableModel) => {
        return table.schemaName?.trim()
            ? `${table.schemaName.trim()}.${table.physicalName}`
            : table.physicalName;
    }, []);
    const {
        table,
        tableWidth,
        compact,
        displayMode,
        onEditTable,
        physicalTitle,
        relationshipEndpointHighlight,
    } = data;
    const columnSignature = useMemo(
        () => table.columns.map((c) => c.id).join("|"),
        [table.columns],
    );
    useEffect(() => {
        updateNodeInternals(table.id);
    }, [columnSignature, table.id, tableWidth, updateNodeInternals]);
    const title =
        displayMode === "logical"
            ? table.logicalName
            : physicalTitle || table.physicalName || table.logicalName;

    const headerBackground = table.color ?? "#e8f0ff";
    const headerTextColor = getHeaderTextColor(headerBackground);
    const headerButtonBg =
        headerTextColor === "#ffffff"
            ? "rgba(255,255,255,0.18)"
            : "rgba(15,23,42,0.06)";

    const cardClass = [
        "erd-node-card",
        selected ? "erd-node-card--selected" : "",
        relationshipEndpointHighlight ? "erd-node-card--rel-endpoint" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div
            className={cardClass}
            data-table-id={table.id}
            aria-label={`table-${table.physicalName}`}
            style={{ width: tableWidth }}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onEditTable(table.id);
            }}
        >
            <Handle
                id={TABLE_RELATIONSHIP_SOURCE_HANDLE_LEFT_ID}
                type="source"
                position={Position.Left}
                className="erd-handle-dot erd-handle-dot--hidden"
                isConnectableStart={false}
                style={{ top: HANDLE_TOP, left: -6 }}
                aria-label="edge-source"
            />
            <Handle
                id={TABLE_RELATIONSHIP_SOURCE_HANDLE_RIGHT_ID}
                type="source"
                position={Position.Right}
                className="erd-handle-dot erd-handle-dot--hidden"
                isConnectableStart={false}
                style={{ top: HANDLE_TOP, right: -6 }}
                aria-label="edge-source"
            />
            {compact
                ? table.columns.map((col, rowIndex) =>
                      col.isForeignKey ? (
                          <React.Fragment key={col.id}>
                              <Handle
                                  id={targetFkColumnHandleId(col.id, "left")}
                                  type="target"
                                  position={Position.Left}
                                  className="erd-handle-dot erd-handle-dot--fk erd-handle-dot--hidden"
                                  isConnectableStart={false}
                                  style={{
                                      position: "absolute",
                                      left: 0,
                                      top: targetRowCenterTopPx(
                                          rowIndex,
                                          table.columns.length,
                                      ),
                                      transform: "translate(-50%, -50%)",
                                  }}
                                  aria-label={`edge-target-${col.id}`}
                              />
                              <Handle
                                  id={targetFkColumnHandleId(col.id, "right")}
                                  type="target"
                                  position={Position.Right}
                                  className="erd-handle-dot erd-handle-dot--fk erd-handle-dot--hidden"
                                  isConnectableStart={false}
                                  style={{
                                      position: "absolute",
                                      right: 0,
                                      top: targetRowCenterTopPx(
                                          rowIndex,
                                          table.columns.length,
                                      ),
                                      transform: "translate(50%, -50%)",
                                  }}
                                  aria-label={`edge-target-${col.id}`}
                              />
                          </React.Fragment>
                      ) : null,
                  )
                : null}
            <div
                className="erd-node-header"
                style={{ background: headerBackground, color: headerTextColor }}
            >
                <span className="erd-node-header-title" title={title}>
                    {title}
                </span>
                <button
                    type="button"
                    className="erd-node-header-btn"
                    aria-label={t("node.editTable")}
                    onClick={() => onEditTable(table.id)}
                    style={{
                        color: headerTextColor,
                        background: headerButtonBg,
                    }}
                >
                    <Pencil size={16} />
                </button>
            </div>
            <div className="erd-node-body">
                {compact ? (
                    <div className="erd-node-row-meta">
                        {t("node.compactSummary", {
                            count: table.columns.length,
                        })}
                    </div>
                ) : (
                    table.columns.map((col) => {
                        const primary =
                            displayMode === "logical"
                                ? col.logicalName
                                : col.physicalName;
                        const secondary =
                            displayMode === "logical"
                                ? col.logicalType
                                : col.physicalType;
                        const rowFg = col.color
                            ? getHeaderTextColor(col.color)
                            : undefined;
                        return (
                            <div
                                key={col.id}
                                className={
                                    col.color
                                        ? "erd-node-row erd-node-row--tinted"
                                        : "erd-node-row"
                                }
                                style={
                                    col.color
                                        ? {
                                              background: col.color,
                                              color: rowFg,
                                          }
                                        : undefined
                                }
                            >
                                {col.isForeignKey ? (
                                    <>
                                        <Handle
                                            id={targetFkColumnHandleId(
                                                col.id,
                                                "left",
                                            )}
                                            type="target"
                                            position={Position.Left}
                                            className="erd-handle-dot erd-handle-dot--fk erd-handle-dot--hidden"
                                            isConnectableStart={false}
                                            style={{
                                                position: "absolute",
                                                left: 0,
                                                top: "50%",
                                                transform:
                                                    "translate(-50%, -50%)",
                                            }}
                                            aria-label={`edge-target-${col.id}`}
                                        />
                                        <Handle
                                            id={targetFkColumnHandleId(
                                                col.id,
                                                "right",
                                            )}
                                            type="target"
                                            position={Position.Right}
                                            className="erd-handle-dot erd-handle-dot--fk erd-handle-dot--hidden"
                                            isConnectableStart={false}
                                            style={{
                                                position: "absolute",
                                                right: 0,
                                                top: "50%",
                                                transform:
                                                    "translate(50%, -50%)",
                                            }}
                                            aria-label={`edge-target-${col.id}`}
                                        />
                                    </>
                                ) : null}
                                <div className="erd-node-row-primary">
                                    <span
                                        className="erd-node-row-pk-icon"
                                        aria-hidden
                                    >
                                        {col.isPrimaryKey ? (
                                            <KeyRound
                                                size={11}
                                                strokeWidth={2.25}
                                            />
                                        ) : col.isForeignKey ? (
                                            <Link2
                                                size={11}
                                                strokeWidth={2.25}
                                            />
                                        ) : null}
                                    </span>
                                    <span
                                        className="erd-node-row-name"
                                        style={{
                                            fontStyle: col.isForeignKey
                                                ? "italic"
                                                : "normal",
                                            fontWeight: col.isPrimaryKey
                                                ? 700
                                                : 500,
                                        }}
                                    >
                                        {primary}
                                    </span>
                                </div>
                                <span className="erd-node-row-meta">
                                    {secondary}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
});

export interface ERDDesignerHandle {
    getJson: () => DesignDocument;
    undo: () => void;
    redo: () => void;
    addTableAt: (table: TableModel, x: number, y: number) => void;
    connectWithForeignKey: (
        sourceTableId: string,
        targetTableId: string,
        sourceColumnId?: string,
    ) => void;
}

/** 테이블 수가 이 값 이상이면 compact + visible-only 렌더 등 성능 모드로 전환한다. */
const INTERNAL_LARGE_DIAGRAM_TABLE_THRESHOLD = 120;

export interface ERDDesignerProps {
    value?: DesignDocument;
    onChange?: (doc: DesignDocument) => void;
    onSaveJson?: (doc: DesignDocument) => void;
    onRequestNewEr?: (currentDialect: RdbmsDialect) => void;
    /** 엣지를 빈 캔버스에 드롭했을 때(흐름 좌표·화면 좌표). 새 테이블 UI는 호스트에서 연다. */
    onRequestCreateTable?: (payload: CreateTableRequestPayload) => void;
    /** Extra host nodes appended at the end of the toolbar. */
    toolbarExtra?: React.ReactNode;
    /** 캔버스 테이블 카드 너비(px). 기본 378(기존 252의 1.5배). */
    tableWidth?: number;
    /**
     * 캔버스에서 `canvasLineHidden`인 관계선까지 임시로 그릴지(표시만, 모델은 변경하지 않음).
     * 지정 시 제어 컴포넌트로 동작하고, 생략 시 `defaultRevealHiddenRelationshipLines`를 사용한다.
     */
    revealHiddenRelationshipLines?: boolean;
    /** 비제어 모드일 때「숨긴 관계선 보기」초기값. 기본 false. */
    defaultRevealHiddenRelationshipLines?: boolean;
    onRevealHiddenRelationshipLinesChange?: (reveal: boolean) => void;
    /** 선택된 관계선을 노드보다 앞으로 올릴지 여부. 기본 false. */
    elevateSelectedRelationships?: boolean;
    /** UI locale for built-in bundles (`ko*`, otherwise `en`). Ignored when `t` is set. */
    locale?: string;
    /** Overrides on top of the locale bundle (hybrid i18n). */
    translations?: Partial<Record<I18nKey, string>>;
    /** Full host control of strings; when set, `locale` / `translations` are ignored. */
    t?: (key: I18nKey, vars?: I18nVars) => string;
    /** Show built-in right-side ER property panel. */
    showRightPanel?: boolean;
    /** Controlled theme mode for the designer chrome. */
    themeMode?: DesignerThemeMode;
    /** Initial theme mode when `themeMode` is not controlled. Default `light`. */
    defaultThemeMode?: DesignerThemeMode;
    /** Theme mode change callback (controlled/uncontrolled). */
    onThemeModeChange?: (mode: DesignerThemeMode) => void;
    /** Host-provided DB metadata + mapping + DDL rules adapter. */
    dbMetaAdapter?: DbMetaAdapter;
    /** Host JSON metadata to override/append built-in dialects by id. */
    hostMetas?: DialectMetaJson[];
    /** Optional host DDL generators keyed by dialect id. */
    hostDdlGenerators?: Record<string, DdlGeneratorHook>;
    /** Fallback to style-based generator when hook fails. Default true. */
    fallbackOnHookError?: boolean;
}

export type ERDDesignerShellProps = Omit<
    ERDDesignerProps,
    "locale" | "translations" | "t"
>;

const nodeTypes = { tableNode: TableNode };
const edgeTypes = { relationship: RelationshipEdge };

const ERDDesignerShell = forwardRef<ERDDesignerHandle, ERDDesignerShellProps>(
    function ERDDesignerShell(
        {
            value,
            onChange,
            onSaveJson,
            onRequestNewEr,
            onRequestCreateTable,
            toolbarExtra,
            tableWidth = 400,
            revealHiddenRelationshipLines: revealHiddenRelationshipLinesProp,
            defaultRevealHiddenRelationshipLines = false,
            onRevealHiddenRelationshipLinesChange,
            elevateSelectedRelationships = false,
            showRightPanel = false,
            themeMode: themeModeProp,
            defaultThemeMode = "light",
            onThemeModeChange,
            dbMetaAdapter = defaultDbMetaAdapter,
            hostMetas,
            hostDdlGenerators,
            fallbackOnHookError = true,
        },
        ref,
    ) {
        const { t } = useErdI18n();
        const coreOptions = useMemo(
            () => ({
                dbMetaAdapter,
                hostMetas,
                hostDdlGenerators,
                fallbackOnHookError,
            }),
            [dbMetaAdapter, fallbackOnHookError, hostDdlGenerators, hostMetas],
        );
        const useDesignerStore = useMemo(
            () => createDesignerStore({ initialDialect: "mssql", coreOptions }),
            [coreOptions],
        );
        const doc = useDesignerStore((s) => s.doc);
        const setDoc = useDesignerStore((s) => s.setDoc);
        const addTable = useDesignerStore((s) => s.addTable);
        const addRelationship = useDesignerStore((s) => s.addRelationship);
        const deleteSelectionFromDoc = useDesignerStore(
            (s) => s.deleteSelection,
        );
        const setTableMeta = useDesignerStore((s) => s.setTableMeta);
        const setTableColumns = useDesignerStore((s) => s.setTableColumns);
        const setNodePosition = useDesignerStore((s) => s.setNodePosition);
        const setNodePositions = useDesignerStore((s) => s.setNodePositions);
        const alignSelected = useDesignerStore((s) => s.alignSelected);
        const setRelationshipCanvasLineHidden = useDesignerStore(
            (s) => s.setRelationshipCanvasLineHidden,
        );
        const setRelationshipCardinality = useDesignerStore(
            (s) => s.setRelationshipCardinality,
        );
        const setRelationshipLinePivotRatio = useDesignerStore(
            (s) => s.setRelationshipLinePivotRatio,
        );
        const setRelationshipSourceLineRatio = useDesignerStore(
            (s) => s.setRelationshipSourceLineRatio,
        );

        const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
        const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
        const [relationshipCardinalityMode, setRelationshipCardinalityMode] =
            useState<RelationshipModel["cardinality"]>("1:N");
        const [relationshipCreateMode, setRelationshipCreateMode] =
            useState(false);
        const [relationshipCreateSelection, setRelationshipCreateSelection] =
            useState<string[]>([]);
        const [elevatedEdgeIds, setElevatedEdgeIds] = useState<string[]>([]);
        const [displayMode, setDisplayMode] =
            useState<CanvasDisplayMode>("logical");
        const themeControlled = themeModeProp !== undefined;
        const [themeModeInternal, setThemeModeInternal] =
            useState<DesignerThemeMode>(defaultThemeMode);
        const themeMode = themeControlled ? themeModeProp : themeModeInternal;
        const setThemeMode = useCallback(
            (next: DesignerThemeMode) => {
                if (!themeControlled) setThemeModeInternal(next);
                onThemeModeChange?.(next);
            },
            [onThemeModeChange, themeControlled],
        );
        const revealControlled =
            revealHiddenRelationshipLinesProp !== undefined;
        const [revealHiddenInternal, setRevealHiddenInternal] = useState(
            defaultRevealHiddenRelationshipLines,
        );
        const revealHiddenRelationshipLines = revealControlled
            ? revealHiddenRelationshipLinesProp
            : revealHiddenInternal;
        const setRevealHiddenRelationshipLines = useCallback(
            (next: boolean) => {
                if (!revealControlled) setRevealHiddenInternal(next);
                onRevealHiddenRelationshipLinesChange?.(next);
            },
            [revealControlled, onRevealHiddenRelationshipLinesChange],
        );

        const [edgeContextMenu, setEdgeContextMenu] = useState<{
            clientX: number;
            clientY: number;
            edgeId: string;
        } | null>(null);

        const [editingTableId, setEditingTableId] = useState<string | null>(
            null,
        );
        const [creatingTableDraft, setCreatingTableDraft] =
            useState<TableModel | null>(null);
        const [createTableContext, setCreateTableContext] =
            useState<InternalCreateTableContext | null>(null);
        const [selectionDragArmed, setSelectionDragArmed] = useState(false);
        const [panelVisible, setPanelVisible] = useState(false);
        const [panelTableQuery, setPanelTableQuery] = useState("");
        const [hasDesign, setHasDesign] = useState<boolean>(Boolean(value));
        const [newErDialogOpen, setNewErDialogOpen] = useState(false);
        const [newErDraft, setNewErDraft] = useState<{
            projectName: string;
            projectDescription: string;
            dialect: RdbmsDialect;
        }>({
            projectName: "",
            projectDescription: "",
            dialect: "mssql",
        });
        const [savedSignature, setSavedSignature] = useState<string>("");
        const idRef = useRef(1);
        const docSyncFromValueRef = useRef(false);
        const pendingFitFromValueRef = useRef(false);
        const lastOnChangeSignatureRef = useRef<string>("");
        const rfInstanceRef = useRef<ReactFlowInstance<
            Node<TableNodeData>,
            Edge
        > | null>(null);
        const pendingConnectSourceRef = useRef<{
            tableId: string;
            handleId?: string | null;
        } | null>(null);
        const canvasRootRef = useRef<HTMLDivElement | null>(null);
        const edgeContextMenuRef = useRef<HTMLDivElement | null>(null);

        useEffect(() => {
            if (!value) {
                setHasDesign(false);
                setSavedSignature("");
                lastOnChangeSignatureRef.current = "";
                setSelectedNodeIds([]);
                setSelectedEdgeIds([]);
                setEditingTableId(null);
                setCreatingTableDraft(null);
                setSelectionDragArmed(false);
                return;
            }
            const incomingSignature = serializeDesign(value);
            const echoedFromLocalChange =
                incomingSignature === lastOnChangeSignatureRef.current;
            setHasDesign(true);
            if (!echoedFromLocalChange) {
                setSavedSignature(incomingSignature);
            }
            docSyncFromValueRef.current = true;
            const temporal = useDesignerStore.temporal.getState();
            temporal.pause();
            setDoc(value);
            temporal.resume();
            pendingFitFromValueRef.current = true;
            queueMicrotask(() => {
                docSyncFromValueRef.current = false;
                requestAnimationFrame(() => {
                    void rfInstanceRef.current?.fitView({
                        duration: 0,
                        padding: 0.1,
                        maxZoom: 0.95,
                    });
                });
            });
        }, [value, setDoc, useDesignerStore.temporal]);

        useEffect(() => {
            if (!hasDesign) return;
            if (docSyncFromValueRef.current) return;
            lastOnChangeSignatureRef.current = serializeDesign(doc);
            onChange?.(doc);
        }, [doc, hasDesign, onChange]);

        const relationshipEndpointTableIds = useMemo(() => {
            const set = new Set<string>();
            for (const id of selectedEdgeIds) {
                const rel = doc.model.relationships.find((r) => r.id === id);
                if (rel) {
                    set.add(rel.sourceTableId);
                    set.add(rel.targetTableId);
                }
            }
            return set;
        }, [doc.model.relationships, selectedEdgeIds]);

        useEffect(() => {
            if (!edgeContextMenu) return;
            const onKey = (e: KeyboardEvent) => {
                if (e.key === "Escape") setEdgeContextMenu(null);
            };
            const onDown = (e: MouseEvent) => {
                const el = edgeContextMenuRef.current;
                const t = e.target;
                if (el && t instanceof globalThis.Node && el.contains(t)) return;
                setEdgeContextMenu(null);
            };
            window.addEventListener("keydown", onKey);
            window.addEventListener("mousedown", onDown);
            return () => {
                window.removeEventListener("keydown", onKey);
                window.removeEventListener("mousedown", onDown);
            };
        }, [edgeContextMenu]);

        const tableCount = doc.model.tables.length;
        const largeDiagram =
            tableCount >= INTERNAL_LARGE_DIAGRAM_TABLE_THRESHOLD;
        const formatPhysicalTableName = useCallback((table: TableModel) => {
            const schema = table.schemaName?.trim();
            return schema
                ? `${schema}.${table.physicalName}`
                : table.physicalName;
        }, []);
        const panelTables = useMemo(() => {
            const q = panelTableQuery.trim().toLowerCase();
            const mapped = doc.model.tables.map((table) => {
                const physicalName =
                    formatPhysicalTableName(table) || table.logicalName;
                const label =
                    displayMode === "logical"
                        ? table.logicalName
                        : physicalName;
                return {
                    id: table.id,
                    label,
                    logicalName: table.logicalName,
                    physicalName,
                };
            });
            if (!q) return mapped;
            return mapped.filter(
                (table) =>
                    table.label.toLowerCase().includes(q) ||
                    table.logicalName.toLowerCase().includes(q) ||
                    table.physicalName.toLowerCase().includes(q),
            );
        }, [
            displayMode,
            doc.model.tables,
            formatPhysicalTableName,
            panelTableQuery,
        ]);

        const largeDefaultViewport = useMemo(
            () => ({ x: 40, y: 40, zoom: 0.22 }),
            [],
        );
        const dialectOptions = useMemo(
            () => resolveDialectMetas(coreOptions),
            [coreOptions],
        );

        const onEditTable = useCallback((tableId: string) => {
            setEditingTableId(tableId);
        }, []);

        const flowNodes: Node<TableNodeData>[] = useMemo(
            () =>
                (hasDesign ? doc.model.tables : []).map((table) => ({
                    id: table.id,
                    type: "tableNode",
                    position: doc.layout.nodePositions[table.id] ?? {
                        x: 60,
                        y: 60,
                    },
                    data: {
                        table,
                        tableWidth,
                        compact: largeDiagram,
                        displayMode,
                        physicalTitle: formatPhysicalTableName(table),
                        onEditTable,
                        relationshipEndpointHighlight:
                            relationshipEndpointTableIds.has(table.id),
                    },
                })),
            [
                doc,
                displayMode,
                formatPhysicalTableName,
                hasDesign,
                largeDiagram,
                onEditTable,
                relationshipEndpointTableIds,
                tableWidth,
            ],
        );

        const flowEdges: Edge<RelationshipEdgeData>[] = useMemo(() => {
            if (!hasDesign) return [];
            return buildRelationshipFlowEdges(
                doc.model,
                doc.layout.nodePositions,
                tableWidth,
                revealHiddenRelationshipLines,
                {
                    onLinePivotRatioChange: (relationshipId, ratio) =>
                        setRelationshipLinePivotRatio(relationshipId, ratio),
                    onSourceLineRatioChange: (relationshipId, ratio) =>
                        setRelationshipSourceLineRatio(relationshipId, ratio),
                },
            );
        }, [
            doc.model,
            doc.layout.nodePositions,
            hasDesign,
            revealHiddenRelationshipLines,
            setRelationshipLinePivotRatio,
            setRelationshipSourceLineRatio,
            tableWidth,
        ]);

        const diagramSignature = useMemo(
            () =>
                `${revealHiddenRelationshipLines ? 1 : 0}:${largeDiagram ? 1 : 0}:${displayMode}:${serializeDesign(doc)}`,
            [displayMode, doc, largeDiagram, revealHiddenRelationshipLines],
        );

        const [nodes, setNodes] = useState<Node<TableNodeData>[]>(flowNodes);
        const [edges, setEdges] = useState<Edge[]>(flowEdges);

        const flowNodesRef = useRef(flowNodes);
        const flowEdgesRef = useRef(flowEdges);
        const relationshipEndpointSignatureRef = useRef<Record<string, string>>(
            {},
        );
        const liveEdgeSignatureRef = useRef<Record<string, string>>({});
        flowNodesRef.current = flowNodes;
        flowEdgesRef.current = flowEdges;

        const selectionSigRef = useRef<string>("");

        useEffect(() => {
            selectionSigRef.current = "";
            setNodes((prev) => {
                const prevById = new Map(prev.map((n) => [n.id, n]));
                return flowNodesRef.current.map((next) => {
                    const old = prevById.get(next.id);
                    return {
                        ...old,
                        ...next,
                        selected: old?.selected ?? false,
                    };
                });
            });
            setEdges((prev) => {
                const prevById = new Map(prev.map((e) => [e.id, e]));
                return flowEdgesRef.current.map((next) => {
                    const old = prevById.get(next.id);
                    return {
                        ...old,
                        ...next,
                        selected: old?.selected ?? false,
                    };
                });
            });
            if (pendingFitFromValueRef.current) {
                requestAnimationFrame(() => {
                    void rfInstanceRef.current?.fitView({
                        duration: 0,
                        padding: 0.1,
                        maxZoom: 0.95,
                    });
                });
                pendingFitFromValueRef.current = false;
            }
        }, [diagramSignature, tableWidth]);

        useEffect(() => {
            const elevated = new Set(elevatedEdgeIds);
            setEdges((prev) =>
                prev.map((edge) => {
                    const raw = edge.className ?? "";
                    const withoutFlag = raw
                        .split(" ")
                        .filter(
                            (name) =>
                                name.length > 0 && name !== "erd-edge-elevated",
                        )
                        .join(" ");
                    const shouldElevate =
                        elevateSelectedRelationships && elevated.has(edge.id);
                    const className = shouldElevate
                        ? `${withoutFlag} erd-edge-elevated`.trim()
                        : withoutFlag || undefined;
                    const zIndex = shouldElevate ? 1200 : 0;
                    if (
                        (edge.className ?? undefined) === className &&
                        (edge.zIndex ?? 0) === zIndex
                    ) {
                        return edge;
                    }
                    return { ...edge, className, zIndex };
                }),
            );
        }, [elevateSelectedRelationships, elevatedEdgeIds]);

        const onNodesChange = useCallback(
            (changes: NodeChange<Node<TableNodeData>>[]) => {
                setNodes((nds) => {
                    const nextNodes = applyNodeChanges(changes, nds);
                    if (!hasDesign) return nextNodes;
                    const nextNodePositions: Record<
                        string,
                        { x: number; y: number }
                    > = {};
                    for (const node of nextNodes) {
                        nextNodePositions[node.id] = {
                            x: node.position.x,
                            y: node.position.y,
                        };
                    }
                    const nextFlowEdges = buildRelationshipFlowEdges(
                        doc.model,
                        nextNodePositions,
                        tableWidth,
                        revealHiddenRelationshipLines,
                        {
                            onLinePivotRatioChange: (relationshipId, ratio) =>
                                setRelationshipLinePivotRatio(
                                    relationshipId,
                                    ratio,
                                ),
                            onSourceLineRatioChange: (relationshipId, ratio) =>
                                setRelationshipSourceLineRatio(
                                    relationshipId,
                                    ratio,
                                ),
                        },
                    );
                    setEdges((prev) => {
                        const prevById = new Map(prev.map((e) => [e.id, e]));
                        const nextLiveSignatures: Record<string, string> = {};
                        const mapped = nextFlowEdges.map((nextEdge) => {
                            const old = prevById.get(nextEdge.id);
                            const nextSignature = `${nextEdge.sourceHandle ?? ""}|${nextEdge.targetHandle ?? ""}`;
                            nextLiveSignatures[nextEdge.id] = nextSignature;
                            const prevLiveSignature =
                                liveEdgeSignatureRef.current[nextEdge.id];
                            const routingTypeChanged =
                                prevLiveSignature !== undefined &&
                                prevLiveSignature !== nextSignature;
                            if (routingTypeChanged) {
                                // 이동 중 유형이 바뀌면 즉시 x(linePivotRatio)를 무효화한다.
                                setRelationshipLinePivotRatio(
                                    nextEdge.id,
                                    undefined,
                                );
                            }
                            const nextData =
                                nextEdge.data &&
                                typeof nextEdge.data === "object"
                                    ? {
                                          ...(nextEdge.data as RelationshipEdgeData),
                                          // 이동 중 라우팅 유형이 바뀌면 기존 세로선 X는 무효화하고
                                          // 유형별 기본 배치로 즉시 재계산되도록 ratio를 비운다.
                                          linePivotRatio: routingTypeChanged
                                              ? undefined
                                              : (nextEdge.data as RelationshipEdgeData)
                                                    .linePivotRatio,
                                      }
                                    : nextEdge.data;
                            const merged = {
                                ...old,
                                ...nextEdge,
                                data: nextData,
                                selected: old?.selected ?? false,
                            };
                            return merged;
                        });
                        liveEdgeSignatureRef.current = nextLiveSignatures;
                        return mapped;
                    });
                    return nextNodes;
                });
            },
            [
                doc.model,
                hasDesign,
                revealHiddenRelationshipLines,
                setRelationshipLinePivotRatio,
                setRelationshipSourceLineRatio,
                tableWidth,
            ],
        );

        useEffect(() => {
            if (!hasDesign) return;
            const nextSignatures: Record<string, string> = {};
            const relMap = new Map(
                doc.model.relationships.map((rel) => [rel.id, rel] as const),
            );
            for (const edge of flowEdges) {
                const relationshipId = edge.id;
                const signature = `${edge.sourceHandle ?? ""}|${edge.targetHandle ?? ""}`;
                nextSignatures[relationshipId] = signature;
                const edgeData = edge.data as RelationshipEdgeData | undefined;
                if (!edgeData) continue;
                const prevSignature =
                    relationshipEndpointSignatureRef.current[relationshipId];
                if (prevSignature !== undefined && prevSignature !== signature) {
                    // source/target 유형이 바뀌면 기존 세로선 X 비율을 무효화한다.
                    // 이후 사용자가 드래그해 다시 저장하기 전까지는 undefined를 유지한다.
                    setRelationshipSourceLineRatio(
                        relationshipId,
                        clamp01(edgeData.sourceLineRatio),
                    );
                    setRelationshipLinePivotRatio(relationshipId, undefined);
                    continue;
                }
                const rel = relMap.get(relationshipId);
                if (!rel) continue;
                if (typeof rel.sourceLineRatio !== "number") {
                    setRelationshipSourceLineRatio(
                        relationshipId,
                        clamp01(edgeData.sourceLineRatio),
                    );
                }
            }
            relationshipEndpointSignatureRef.current = nextSignatures;
            liveEdgeSignatureRef.current = nextSignatures;
        }, [
            doc.model.relationships,
            flowEdges,
            hasDesign,
            setRelationshipLinePivotRatio,
            setRelationshipSourceLineRatio,
        ]);

        const onEdgesChange = useCallback((changes: EdgeChange[]) => {
            setEdges((eds) => applyEdgeChanges(changes, eds));
            const selectionChanges = changes.filter(
                (c): c is Extract<EdgeChange, { type: "select" }> =>
                    c.type === "select",
            );
            if (selectionChanges.length === 0) return;
            setSelectedEdgeIds((prev) => {
                const next = new Set(prev);
                for (const c of selectionChanges) {
                    if (c.selected) next.add(c.id);
                    else next.delete(c.id);
                }
                return [...next];
            });
        }, []);

        const onSelectionChange = useCallback(
            (params: { nodes: Node[]; edges: Edge[] }) => {
                const nSig = params.nodes.map((n) => n.id).join("\0");
                const eSig = params.edges.map((e) => e.id).join("\0");
                const next = `${nSig}|${eSig}`;
                if (next === selectionSigRef.current) return;
                selectionSigRef.current = next;
                setSelectedNodeIds(params.nodes.map((n) => n.id));
                setSelectedEdgeIds(params.edges.map((e) => e.id));
                if (params.edges.length > 0) {
                    setElevatedEdgeIds(params.edges.map((e) => e.id));
                } else {
                    setElevatedEdgeIds([]);
                }
                if (selectionDragArmed) {
                    setSelectionDragArmed(false);
                }
            },
            [selectionDragArmed],
        );

        const onEdgeClick = useCallback(
            (_event: React.MouseEvent, edge: Edge) => {
            setElevatedEdgeIds([edge.id]);
            },
            [],
        );

        useEffect(() => {
            setNodes((prev) =>
                prev.map((node) => {
                    const active = relationshipEndpointTableIds.has(node.id);
                    const data = node.data as TableNodeData;
                    if (data.relationshipEndpointHighlight === active) {
                        return node;
                    }
                    return {
                        ...node,
                        data: {
                            ...data,
                            relationshipEndpointHighlight: active,
                        },
                    };
                }),
            );
        }, [relationshipEndpointTableIds]);

        const onEdgeContextMenu = useCallback<EdgeMouseHandler<Edge>>(
            (event, edge) => {
                event.preventDefault();
                if (!hasDesign) return;
                if (!edge.selected && !selectedEdgeIds.includes(edge.id)) {
                    return;
                }
                setEdgeContextMenu({
                    clientX: event.clientX,
                    clientY: event.clientY,
                    edgeId: edge.id,
                });
            },
            [hasDesign, selectedEdgeIds],
        );

        const onFlowInit = useCallback(
            (instance: ReactFlowInstance<Node<TableNodeData>, Edge>) => {
                rfInstanceRef.current = instance;
                if (largeDiagram) return;
                requestAnimationFrame(() => {
                    void instance.fitView({
                        duration: 0,
                        padding: 0.1,
                        maxZoom: 0.95,
                    });
                });
            },
            [largeDiagram],
        );

        const openCreateTableDialog = useCallback(() => {
            if (!hasDesign) return;
            const n = idRef.current;
            const name = t("designer.defaultTableLogicalName", { n });
            setCreateTableContext({ mode: "toolbar" });
            setCreatingTableDraft({
                id: `table-${n}`,
                logicalName: name,
                physicalName: name,
                columns: [],
                color: "#e8f0ff",
            });
        }, [hasDesign, t]);

        const openCreateTableDialogFromRequest = useCallback(
            (payload: CreateTableRequestPayload) => {
                const dialect = doc.model.dialect;
                const sourceTable = payload.sourceTableId
                    ? doc.model.tables.find(
                          (table) => table.id === payload.sourceTableId,
                      )
                    : undefined;
                const sourcePkColumns = (payload.sourcePrimaryColumnIds ?? [])
                    .map((id) =>
                        sourceTable?.columns.find((column) => column.id === id),
                    )
                    .filter((column): column is NonNullable<typeof column> =>
                        Boolean(column),
                    );
                const relationSeedColumns = sourcePkColumns.map(
                    (sourceColumn) =>
                        createColumn(
                            dialect,
                            {
                                id: createId("col"),
                                logicalName: sourceColumn.logicalName,
                                physicalName: sourceColumn.physicalName,
                                logicalType: sourceColumn.logicalType,
                                nullable: true,
                                isForeignKey: true,
                                referencesPrimaryColumnId: sourceColumn.id,
                            },
                            coreOptions,
                        ),
                );
                setCreateTableContext({
                    mode: "edge-drop",
                    flowX: payload.flowX,
                    flowY: payload.flowY,
                    sourceTableId: payload.sourceTableId,
                    sourcePrimaryColumnIds: payload.sourcePrimaryColumnIds,
                });
                setCreatingTableDraft({
                    id: createId("table"),
                    logicalName: t("designer.defaultTableLogicalName", {
                        n: idRef.current,
                    }),
                    physicalName: t("designer.defaultTableLogicalName", {
                        n: idRef.current,
                    }),
                    color: "#e8f0ff",
                    columns: relationSeedColumns,
                });
            },
            [doc.model.dialect, doc.model.tables, t],
        );

        const addTableAt = useCallback(
            (table: TableModel, x: number, y: number) => {
                if (!hasDesign) return;
                addTable(table, x, y);
            },
            [addTable, hasDesign],
        );

        const connectWithForeignKey = useCallback(
            (
                sourceTableId: string,
                targetTableId: string,
                sourceColumnId?: string,
            ) => {
                if (!hasDesign) return;
                if (sourceTableId === targetTableId) return;
                const latestDoc = useDesignerStore.getState().doc;
                const sourceTable = latestDoc.model.tables.find(
                    (t) => t.id === sourceTableId,
                );
                const targetTable = latestDoc.model.tables.find(
                    (t) => t.id === targetTableId,
                );
                if (!sourceTable || !targetTable) return;

                const sourcePkColumns = sourceTable.columns.filter(
                    (c) => c.isPrimaryKey,
                );
                if (sourcePkColumns.length === 0) return;

                const sourceColumns =
                    sourceColumnId !== undefined
                        ? sourcePkColumns.filter((c) => c.id === sourceColumnId)
                        : sourcePkColumns;
                if (sourceColumns.length === 0) return;

                let nextTargetColumns = [...targetTable.columns];
                const relationshipsToAdd: Array<{
                    sourceColumnId: string;
                    targetColumnId: string;
                    autoCreatedTargetColumn: boolean;
                }> = [];

                for (const sourceColumn of sourceColumns) {
                    const existingFkColumn = nextTargetColumns.find(
                        (c) =>
                            c.isForeignKey &&
                            c.referencesPrimaryColumnId === sourceColumn.id,
                    );

                    let targetColumnId: string;
                    let autoCreatedTargetColumn = false;
                    if (existingFkColumn) {
                        targetColumnId = existingFkColumn.id;
                    } else {
                        const fkColumn = createColumn(
                            latestDoc.model.dialect,
                            {
                                id: createId("col"),
                                logicalName: sourceColumn.logicalName,
                                physicalName: sourceColumn.physicalName,
                                logicalType: sourceColumn.logicalType,
                                nullable: true,
                                isForeignKey: true,
                                referencesPrimaryColumnId: sourceColumn.id,
                            },
                            coreOptions,
                        );
                        nextTargetColumns = [...nextTargetColumns, fkColumn];
                        targetColumnId = fkColumn.id;
                        autoCreatedTargetColumn = true;
                    }

                    const relExists = latestDoc.model.relationships.some(
                        (r) =>
                            r.sourceTableId === sourceTableId &&
                            r.targetTableId === targetTableId &&
                            r.sourceColumnId === sourceColumn.id &&
                            r.targetColumnId === targetColumnId,
                    );
                    if (!relExists) {
                        relationshipsToAdd.push({
                            sourceColumnId: sourceColumn.id,
                            targetColumnId,
                            autoCreatedTargetColumn,
                        });
                    }
                }

                if (nextTargetColumns.length !== targetTable.columns.length) {
                    setTableColumns(targetTableId, nextTargetColumns);
                }
                for (const rel of relationshipsToAdd) {
                    addRelationship({
                        id: createId("rel"),
                        sourceTableId,
                        targetTableId,
                        sourceColumnId: rel.sourceColumnId,
                        targetColumnId: rel.targetColumnId,
                        autoCreatedTargetColumn: rel.autoCreatedTargetColumn,
                        originPkColumnId: rel.sourceColumnId,
                        cardinality: relationshipCardinalityMode,
                        sourceLineRatio: 0.5,
                        linePivotRatio: 0.5,
                    });
                }
            },
            [
                addRelationship,
                coreOptions,
                hasDesign,
                relationshipCardinalityMode,
                setTableColumns,
                useDesignerStore,
            ],
        );

        const onConnect = useCallback(
            (connection: Connection) => {
                if (!hasDesign) return;
                if (!connection.source || !connection.target) return;
                connectWithForeignKey(connection.source, connection.target);
                pendingConnectSourceRef.current = null;
            },
            [connectWithForeignKey, hasDesign],
        );

        const onNodeClickInCanvas = useCallback(
            (_event: unknown, node: Node) => {
                setElevatedEdgeIds([]);
                if (!relationshipCreateMode || !hasDesign) return;
                setRelationshipCreateSelection((prev) => {
                    if (prev.includes(node.id)) return prev;
                    return [...prev, node.id];
                });
            },
            [hasDesign, relationshipCreateMode],
        );

        useEffect(() => {
            if (!relationshipCreateMode) return;
            if (relationshipCreateSelection.length < 2) return;
            const [sourceTableId, targetTableId] = relationshipCreateSelection;
            if (sourceTableId && targetTableId) {
                connectWithForeignKey(sourceTableId, targetTableId);
            }
            setRelationshipCreateMode(false);
            setRelationshipCreateSelection([]);
        }, [
            connectWithForeignKey,
            relationshipCreateMode,
            relationshipCreateSelection,
        ]);

        const onConnectStart = useCallback<OnConnectStart>(
            (_event, params) => {
                if (selectionDragArmed) {
                    setSelectionDragArmed(false);
                }
                if (!hasDesign) {
                    pendingConnectSourceRef.current = null;
                    return;
                }
                if (!params.nodeId) {
                    pendingConnectSourceRef.current = null;
                    return;
                }
                pendingConnectSourceRef.current = {
                    tableId: params.nodeId,
                    handleId: params.handleId,
                };
            },
            [hasDesign, selectionDragArmed],
        );

        const onNodeDragStop = useCallback(
            (_: unknown, node: Node) => {
                if (!hasDesign) return;
                const selectedIds = new Set(selectedNodeIds);
                if (selectedIds.size <= 1 || !selectedIds.has(node.id)) {
                    setNodePosition(node.id, node.position.x, node.position.y);
                    return;
                }
                const allNodes = rfInstanceRef.current?.getNodes() ?? [];
                const movedPositions: Record<string, { x: number; y: number }> =
                    {};
                for (const n of allNodes) {
                    if (!selectedIds.has(n.id)) continue;
                    movedPositions[n.id] = { x: n.position.x, y: n.position.y };
                }
                setNodePositions(movedPositions);
            },
            [hasDesign, selectedNodeIds, setNodePosition, setNodePositions],
        );

        /** Deletes selected relationship edges and tables in one store action (single undo step). */
        const deleteSelectedSelection = useCallback(() => {
            if (!hasDesign) return;
            if (selectedEdgeIds.length === 0 && selectedNodeIds.length === 0)
                return;
            const relationshipIds = selectedEdgeIds.filter((id) =>
                doc.model.relationships.some((rel) => rel.id === id),
            );
            deleteSelectionFromDoc(selectedNodeIds, relationshipIds);
            setSelectedEdgeIds([]);
            setSelectedNodeIds([]);
        }, [
            hasDesign,
            deleteSelectionFromDoc,
            doc.model.relationships,
            selectedEdgeIds,
            selectedNodeIds,
        ]);

        useEffect(() => {
            const onKeyDown = (e: KeyboardEvent) => {
                if (e.key !== "Backspace" && e.key !== "Delete") return;
                const target = e.target as HTMLElement | null;
                const tag = target?.tagName;
                const editable =
                    target?.isContentEditable ||
                    tag === "INPUT" ||
                    tag === "TEXTAREA" ||
                    tag === "SELECT";
                if (editable) return;
                if (
                    selectedNodeIds.length === 0 &&
                    selectedEdgeIds.length === 0
                )
                    return;
                e.preventDefault();
                deleteSelectedSelection();
            };
            window.addEventListener("keydown", onKeyDown);
            return () => window.removeEventListener("keydown", onKeyDown);
        }, [
            deleteSelectedSelection,
            selectedEdgeIds.length,
            selectedNodeIds.length,
        ]);

        useImperativeHandle(
            ref,
            () => ({
                getJson: () => doc,
                undo: () => {
                    useDesignerStore.temporal.getState().undo();
                },
                redo: () => {
                    useDesignerStore.temporal.getState().redo();
                },
                addTableAt,
                connectWithForeignKey,
            }),
            [addTableAt, connectWithForeignKey, doc, useDesignerStore],
        );

        const runAlign = (type: AlignType) => {
            alignSelected(selectedNodeIds, type);
        };
        const focusTableOnCanvas = useCallback(
            (tableId: string) => {
                const inst = rfInstanceRef.current;
                if (!inst) return;
                const node = inst.getNode(tableId);
                const pos = node?.position ?? doc.layout.nodePositions[tableId];
                if (!pos) return;
                const centerX = pos.x + tableWidth / 2;
                const centerY = pos.y + 22;
                void inst.setCenter(centerX, centerY, { duration: 260 });
            },
            [doc.layout.nodePositions, tableWidth],
        );

        const createNewEr = useCallback(() => {
            const dirty = hasDesign && serializeDesign(doc) !== savedSignature;
            if (dirty) {
                const ok = window.confirm(
                    `${t("dialog.confirm.unsaved.title")}\n\n${t("dialog.confirm.unsaved.newEr")}`,
                );
                if (!ok) return;
            }
            if (onRequestNewEr) {
                onRequestNewEr(doc.model.dialect);
                return;
            }
            setNewErDraft({
                projectName: "",
                projectDescription: "",
                dialect: doc.model.dialect,
            });
            setNewErDialogOpen(true);
        }, [doc, hasDesign, onRequestNewEr, savedSignature, t]);

        const createNewErFromDraft = useCallback(() => {
            const next = createEmptyDesign(newErDraft.dialect);
            next.settings = {
                ...(next.settings ?? {}),
                projectName: newErDraft.projectName,
                projectDescription: newErDraft.projectDescription,
            };
            const temporal = useDesignerStore.temporal.getState();
            temporal.pause();
            setDoc(next);
            temporal.clear();
            temporal.resume();
            setHasDesign(true);
            setSavedSignature(serializeDesign(next));
            setSelectedNodeIds([]);
            setSelectedEdgeIds([]);
            setEditingTableId(null);
            setCreatingTableDraft(null);
            setSelectionDragArmed(false);
            setNewErDialogOpen(false);
        }, [newErDraft, setDoc, useDesignerStore.temporal]);

        const toolbarDisabled = !hasDesign;
        const isDirty = hasDesign && serializeDesign(doc) !== savedSignature;
        const temporalStore = useDesignerStore.temporal;
        const pastCount = useStore(temporalStore, (s) => s.pastStates.length);
        const futureCount = useStore(
            temporalStore,
            (s) => s.futureStates.length,
        );
        const canUndo = hasDesign && pastCount > 0;
        const canRedo = hasDesign && futureCount > 0;

        const editingTable = editingTableId
            ? (doc.model.tables.find((t) => t.id === editingTableId) ?? null)
            : null;

        const onConnectEnd = useCallback<OnConnectEnd>(
            (event, connectionState) => {
                if (!connectionState.fromHandle || connectionState.toNode) {
                    pendingConnectSourceRef.current = null;
                    return;
                }
                const el = event.target as HTMLElement | null;
                const tableHost = el?.closest<HTMLElement>("[data-table-id]");
                const targetTableId = tableHost?.dataset.tableId;
                const source = pendingConnectSourceRef.current;
                if (targetTableId && source?.tableId) {
                    if (hasDesign && targetTableId !== source.tableId) {
                        connectWithForeignKey(source.tableId, targetTableId);
                    }
                    pendingConnectSourceRef.current = null;
                    return;
                }
                const clientX =
                    "clientX" in event
                        ? event.clientX
                        : ((event as TouchEvent).changedTouches?.[0]?.clientX ??
                          0);
                const clientY =
                    "clientY" in event
                        ? event.clientY
                        : ((event as TouchEvent).changedTouches?.[0]?.clientY ??
                          0);
                const screenX = "screenX" in event ? event.screenX : clientX;
                const screenY = "screenY" in event ? event.screenY : clientY;
                const inst = rfInstanceRef.current;
                const flow = inst?.screenToFlowPosition({
                    x: clientX,
                    y: clientY,
                }) ?? { x: clientX, y: clientY };
                const sourceTable = source
                    ? doc.model.tables.find((t) => t.id === source.tableId)
                    : undefined;
                const sourcePrimaryColumnIds = (sourceTable?.columns ?? [])
                    .filter((c) => c.isPrimaryKey)
                    .map((c) => c.id);
                const payload: CreateTableRequestPayload = {
                    flowX: flow.x,
                    flowY: flow.y,
                    screenX,
                    screenY,
                    sourceTableId:
                        sourcePrimaryColumnIds.length > 0
                            ? source?.tableId
                            : undefined,
                    sourcePrimaryColumnIds,
                };
                if (onRequestCreateTable) {
                    onRequestCreateTable(payload);
                } else {
                    openCreateTableDialogFromRequest(payload);
                }
                pendingConnectSourceRef.current = null;
            },
            [
                connectWithForeignKey,
                doc.model.tables,
                hasDesign,
                onRequestCreateTable,
                openCreateTableDialogFromRequest,
            ],
        );

        const copyDdlScript = useCallback(async () => {
            if (!hasDesign) return;
            const sql =
                selectedNodeIds.length > 0
                    ? generateDdlForSelection(doc, selectedNodeIds, coreOptions)
                          .sql
                    : generateDdl(doc, coreOptions);
            if (!sql.trim()) return;
            try {
                await navigator.clipboard.writeText(sql);
            } catch {}
        }, [coreOptions, doc, hasDesign, selectedNodeIds]);

        const copySelectedTables = useCallback(async () => {
            if (!hasDesign) return;
            if (selectedNodeIds.length === 0) return;
            const selected = new Set(selectedNodeIds);
            const tables = doc.model.tables
                .filter((t) => selected.has(t.id))
                .map((t) => ({
                    ...t,
                    columns: t.columns.map((c) => ({ ...c })),
                }));
            const relationships = doc.model.relationships
                .filter(
                    (r) =>
                        selected.has(r.sourceTableId) &&
                        selected.has(r.targetTableId),
                )
                .map((r) => ({ ...r }));
            const positions: Record<string, { x: number; y: number }> = {};
            for (const id of selectedNodeIds) {
                positions[id] = doc.layout.nodePositions[id] ?? {
                    x: 60,
                    y: 60,
                };
            }
            const payload: ClipboardTableBundle = {
                marker: "rdbms-erd/table-bundle",
                version: 1,
                tables,
                positions,
                relationships,
            };
            try {
                await navigator.clipboard.writeText(JSON.stringify(payload));
            } catch {}
        }, [
            doc.layout.nodePositions,
            doc.model.relationships,
            doc.model.tables,
            hasDesign,
            selectedNodeIds,
        ]);

        const pasteTablesFromClipboard = useCallback(async () => {
            if (!hasDesign) return;
            let raw = "";
            try {
                raw = await navigator.clipboard.readText();
            } catch {
                return;
            }
            if (!raw.trim()) return;
            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                return;
            }
            const bundle = parsed as ClipboardTableBundle;
            if (
                bundle.marker !== "rdbms-erd/table-bundle" ||
                bundle.version !== 1 ||
                !Array.isArray(bundle.tables)
            ) {
                return;
            }
            const tableIdMap = new Map<string, string>();
            const columnIdMap = new Map<string, string>();
            const pastedTableIds: string[] = [];
            const OFFSET = 48;
            for (const table of bundle.tables) {
                const nextTableId = createId("table");
                tableIdMap.set(table.id, nextTableId);
                const nextColumns = table.columns.map((col) => {
                    const nextColId = createId("col");
                    columnIdMap.set(`${table.id}:${col.id}`, nextColId);
                    return { ...col, id: nextColId };
                });
                const srcPos = bundle.positions?.[table.id] ?? { x: 80, y: 80 };
                addTable(
                    {
                        ...table,
                        id: nextTableId,
                        columns: nextColumns,
                    },
                    srcPos.x + OFFSET,
                    srcPos.y + OFFSET,
                );
                pastedTableIds.push(nextTableId);
            }
            for (const rel of bundle.relationships ?? []) {
                const nextSourceTableId = tableIdMap.get(rel.sourceTableId);
                const nextTargetTableId = tableIdMap.get(rel.targetTableId);
                if (!nextSourceTableId || !nextTargetTableId) continue;
                const nextSourceColumnId = rel.sourceColumnId
                    ? columnIdMap.get(
                          `${rel.sourceTableId}:${rel.sourceColumnId}`,
                      )
                    : undefined;
                const nextTargetColumnId = rel.targetColumnId
                    ? columnIdMap.get(
                          `${rel.targetTableId}:${rel.targetColumnId}`,
                      )
                    : undefined;
                const nextOriginPkColumnId = rel.originPkColumnId
                    ? columnIdMap.get(
                          `${rel.sourceTableId}:${rel.originPkColumnId}`,
                      )
                    : undefined;
                addRelationship({
                    ...rel,
                    id: createId("rel"),
                    sourceTableId: nextSourceTableId,
                    targetTableId: nextTargetTableId,
                    sourceColumnId: nextSourceColumnId,
                    targetColumnId: nextTargetColumnId,
                    originPkColumnId: nextOriginPkColumnId,
                    cardinality: rel.cardinality ?? "1:N",
                    sourceLineRatio:
                        typeof rel.sourceLineRatio === "number"
                            ? rel.sourceLineRatio
                            : 0.5,
                    linePivotRatio: rel.linePivotRatio,
                });
            }
            setSelectedNodeIds(pastedTableIds);
            setSelectedEdgeIds([]);
        }, [addRelationship, addTable, hasDesign]);

        const exportCanvasBlob = useCallback(async (): Promise<Blob | null> => {
            const host = canvasRootRef.current;
            if (!host) return null;

            const selectors = [
                ".react-flow",
                ".react-flow__viewport",
                ".erd-canvas-inner",
            ];
            for (const selector of selectors) {
                const canvasEl = host.querySelector(
                    selector,
                ) as HTMLElement | null;
                if (!canvasEl) continue;
                try {
                    const blob = await toBlob(canvasEl, {
                        cacheBust: true,
                        pixelRatio: 2,
                        backgroundColor: "#ffffff",
                        filter: (node) => {
                            if (!(node instanceof HTMLElement)) return true;
                            if (
                                node.classList.contains(
                                    "erd-edge-context-menu",
                                ) ||
                                node.classList.contains(
                                    "react-flow__controls",
                                ) ||
                                node.classList.contains(
                                    "react-flow__minimap",
                                ) ||
                                node.classList.contains(
                                    "react-flow__attribution",
                                ) ||
                                node.classList.contains(
                                    "react-flow__selection",
                                ) ||
                                node.classList.contains(
                                    "react-flow__nodesselection-rect",
                                )
                            ) {
                                return false;
                            }
                            return true;
                        },
                    });
                    if (blob) return blob;
                } catch {}
            }
            return null;
        }, []);

        const exportPdf = useCallback(async () => {
            if (!hasDesign) return;
            const blob = await exportCanvasBlob();
            if (!blob) return;
            const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result ?? ""));
                reader.readAsDataURL(blob);
            });
            const img = new Image();
            await new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.src = dataUrl;
            });
            const orientation = img.width >= img.height ? "l" : "p";
            const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const scale = Math.min(pageW / img.width, pageH / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (pageW - w) / 2;
            const y = (pageH - h) / 2;
            pdf.addImage(dataUrl, "PNG", x, y, w, h);
            pdf.save(`erd-${new Date().toISOString().slice(0, 10)}.pdf`);
        }, [exportCanvasBlob, hasDesign]);

        const copyCanvasImageToClipboard = useCallback(async () => {
            if (!hasDesign) return;
            const blob = await exportCanvasBlob();
            if (!blob || typeof ClipboardItem === "undefined") return;
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({ "image/png": blob }),
                ]);
            } catch {}
        }, [exportCanvasBlob, hasDesign]);

        return (
            <div
                className={`erd-root${selectionDragArmed ? " erd-selection-armed" : ""}${themeMode === "dark" ? " erd-root--dark" : ""}${elevateSelectedRelationships ? " erd-root--elevate-selected-relationships" : ""}`}
                style={{
                    height: "100%",
                    width: "100%",
                    display: "grid",
                    gridTemplateRows: "auto 1fr",
                    position: "relative",
                }}
            >
                <div className="erd-toolbar">
                    <div className="erd-toolbar-group">
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.newEr")}
                            aria-label={t("toolbar.newEr")}
                            onClick={createNewEr}
                        >
                            <FilePlus size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.saveJson")}
                            onClick={async () => {
                                if (toolbarDisabled || !isDirty) return;
                                onSaveJson?.(doc);
                                setSavedSignature(serializeDesign(doc));
                            }}
                            disabled={toolbarDisabled || !isDirty}
                        >
                            <Save size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.exportPdf")}
                            onClick={() => void exportPdf()}
                            disabled={toolbarDisabled}
                        >
                            <FileDown size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.copyImage")}
                            onClick={() => void copyCanvasImageToClipboard()}
                            disabled={toolbarDisabled}
                        >
                            <FileImage size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.copyDdl")}
                            onClick={() => void copyDdlScript()}
                            disabled={toolbarDisabled}
                        >
                            <FileCode size={16} />
                        </button>
                    </div>
                    <span className="erd-toolbar-sep" />
                    <div className="erd-toolbar-group">
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.addTable")}
                            onClick={openCreateTableDialog}
                            disabled={toolbarDisabled}
                        >
                            <Table2 size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.deleteSelection")}
                            aria-label={t("toolbar.deleteSelection")}
                            disabled={
                                selectedNodeIds.length === 0 &&
                                selectedEdgeIds.length === 0
                            }
                            onClick={deleteSelectedSelection}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                    <span className="erd-toolbar-sep" />
                    <div className="erd-toolbar-group">
                        <button
                            type="button"
                            className={`erd-toolbar-btn${relationshipCardinalityMode === "1:1" ? " erd-toolbar-btn--active" : ""}`}
                            onClick={() =>
                                setRelationshipCardinalityMode("1:1")
                            }
                            aria-pressed={relationshipCardinalityMode === "1:1"}
                            title={t("toolbar.cardinality.oneToOne")}
                            disabled={toolbarDisabled}
                        >
                            {t("toolbar.cardinality.oneToOne")}
                        </button>
                        <button
                            type="button"
                            className={`erd-toolbar-btn${relationshipCardinalityMode === "1:N" ? " erd-toolbar-btn--active" : ""}`}
                            onClick={() =>
                                setRelationshipCardinalityMode("1:N")
                            }
                            aria-pressed={relationshipCardinalityMode === "1:N"}
                            title={t("toolbar.cardinality.oneToMany")}
                            disabled={toolbarDisabled}
                        >
                            {t("toolbar.cardinality.oneToMany")}
                        </button>
                        <button
                            type="button"
                            className={`erd-toolbar-btn${relationshipCreateMode ? " erd-toolbar-btn--active" : ""}`}
                            aria-pressed={relationshipCreateMode}
                            title={t("toolbar.relationshipMode")}
                            disabled={toolbarDisabled}
                            onClick={() => {
                                setRelationshipCreateMode((prev) => !prev);
                                setRelationshipCreateSelection([]);
                            }}
                        >
                            {t("toolbar.relationshipMode")}
                        </button>
                    </div>
                    <span className="erd-toolbar-sep" />
                    <div className="erd-toolbar-group">
                        <button
                            type="button"
                            className="erd-toolbar-btn erd-toolbar-btn--logical-physical"
                            title={`${t("toolbar.modeToggle")}: ${displayMode === "logical" ? t("toolbar.mode.logical") : t("toolbar.mode.physical")}`}
                            aria-label={`${t("toolbar.modeToggle")}: ${displayMode === "logical" ? t("toolbar.mode.logical") : t("toolbar.mode.physical")}`}
                            onClick={() =>
                                setDisplayMode((prev) =>
                                    prev === "logical" ? "physical" : "logical",
                                )
                            }
                            disabled={toolbarDisabled}
                        >
                            <RefreshCw size={16} />
                            <span style={{ fontSize: 12, fontWeight: 600 }}>
                                {displayMode === "logical"
                                    ? t("toolbar.mode.logical")
                                    : t("toolbar.mode.physical")}
                            </span>
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={
                                revealHiddenRelationshipLines
                                    ? t("toolbar.lines.onlyNonHidden")
                                    : t("toolbar.lines.revealHidden")
                            }
                            aria-label={
                                revealHiddenRelationshipLines
                                    ? t("toolbar.lines.onlyNonHidden")
                                    : t("toolbar.lines.revealHidden")
                            }
                            aria-pressed={revealHiddenRelationshipLines}
                            disabled={toolbarDisabled}
                            onClick={() =>
                                setRevealHiddenRelationshipLines(
                                    !revealHiddenRelationshipLines,
                                )
                            }
                        >
                            {revealHiddenRelationshipLines ? (
                                <Eye size={16} />
                            ) : (
                                <EyeOff size={16} />
                            )}
                        </button>
                    </div>
                    <span className="erd-toolbar-sep" />
                    <div className="erd-toolbar-group">
                        <button
                            type="button"
                            className={`erd-toolbar-btn ${selectionDragArmed ? "erd-toolbar-btn--active" : ""}`}
                            title={t("toolbar.selectionDrag")}
                            onClick={() =>
                                setSelectionDragArmed((prev) => !prev)
                            }
                            disabled={toolbarDisabled}
                        >
                            <SquareDashedMousePointer size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.copyTables")}
                            onClick={() => void copySelectedTables()}
                            disabled={
                                toolbarDisabled || selectedNodeIds.length === 0
                            }
                        >
                            <Copy size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.pasteTables")}
                            onClick={() => void pasteTablesFromClipboard()}
                            disabled={toolbarDisabled}
                        >
                            <ClipboardPaste size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.undo")}
                            onClick={() =>
                                useDesignerStore.temporal.getState().undo()
                            }
                            disabled={!canUndo}
                        >
                            <Undo2 size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.redo")}
                            onClick={() =>
                                useDesignerStore.temporal.getState().redo()
                            }
                            disabled={!canRedo}
                        >
                            <Redo2 size={16} />
                        </button>
                    </div>
                    <span className="erd-toolbar-sep" />
                    <div className="erd-toolbar-group">
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.align.left")}
                            onClick={() => runAlign("left")}
                            disabled={toolbarDisabled}
                        >
                            <AlignHorizontalJustifyStart size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.align.hCenter")}
                            onClick={() => runAlign("h-center")}
                            disabled={toolbarDisabled}
                        >
                            <AlignHorizontalJustifyCenter size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.align.right")}
                            onClick={() => runAlign("right")}
                            disabled={toolbarDisabled}
                        >
                            <AlignHorizontalJustifyEnd size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.align.top")}
                            onClick={() => runAlign("top")}
                            disabled={toolbarDisabled}
                        >
                            <AlignVerticalJustifyStart size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.align.vCenter")}
                            onClick={() => runAlign("v-center")}
                            disabled={toolbarDisabled}
                        >
                            <AlignVerticalJustifyCenter size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.align.bottom")}
                            onClick={() => runAlign("bottom")}
                            disabled={toolbarDisabled}
                        >
                            <AlignVerticalJustifyEnd size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.align.hGap")}
                            onClick={() => runAlign("h-gap")}
                            disabled={toolbarDisabled}
                        >
                            <AlignHorizontalSpaceBetween size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.align.vGap")}
                            onClick={() => runAlign("v-gap")}
                            disabled={toolbarDisabled}
                        >
                            <AlignVerticalSpaceBetween size={16} />
                        </button>
                        <button
                            type="button"
                            className="erd-toolbar-btn"
                            title={t("toolbar.fitView")}
                            onClick={() =>
                                void rfInstanceRef.current?.fitView({
                                    duration: 200,
                                    padding: 0.1,
                                    maxZoom: 0.95,
                                })
                            }
                            disabled={toolbarDisabled}
                        >
                            <ZoomIn size={16} />
                        </button>
                    </div>
                    {toolbarExtra || showRightPanel ? (
                        <div
                            style={{
                                marginLeft: "auto",
                                display: "flex",
                                gap: 6,
                                alignItems: "center",
                                flexWrap: "wrap",
                            }}
                        >
                            <button
                                type="button"
                                className={`erd-toolbar-btn${themeMode === "dark" ? " erd-toolbar-btn--active" : ""}`}
                                title={
                                    themeMode === "dark"
                                        ? t("toolbar.theme.toLight")
                                        : t("toolbar.theme.toDark")
                                }
                                aria-label={
                                    themeMode === "dark"
                                        ? t("toolbar.theme.toLight")
                                        : t("toolbar.theme.toDark")
                                }
                                onClick={() =>
                                    setThemeMode(
                                        themeMode === "dark" ? "light" : "dark",
                                    )
                                }
                            >
                                {themeMode === "dark" ? (
                                    <Sun size={16} />
                                ) : (
                                    <Moon size={16} />
                                )}
                            </button>
                            {showRightPanel ? (
                                <button
                                    type="button"
                                    className="erd-toolbar-btn"
                                    onClick={() => setPanelVisible((v) => !v)}
                                    title={
                                        panelVisible
                                            ? t("toolbar.panel.hide")
                                            : t("toolbar.panel.show")
                                    }
                                    aria-label={
                                        panelVisible
                                            ? t("toolbar.panel.hide")
                                            : t("toolbar.panel.show")
                                    }
                                >
                                    <Menu size={16} />
                                </button>
                            ) : null}
                            {toolbarExtra}
                        </div>
                    ) : null}
                </div>
                <div className="erd-main">
                    <div className="erd-canvas-column">
                        <div ref={canvasRootRef} className="erd-canvas-inner">
                            <ReactFlow
                                proOptions={{ hideAttribution: true }}
                                nodes={nodes}
                                edges={edges}
                                deleteKeyCode={null}
                                elevateEdgesOnSelect={false}
                                nodeTypes={nodeTypes}
                                edgeTypes={edgeTypes}
                                onlyRenderVisibleElements={largeDiagram}
                                fitView={false}
                                onInit={onFlowInit}
                                defaultViewport={
                                    largeDiagram
                                        ? largeDefaultViewport
                                        : undefined
                                }
                                minZoom={0.04}
                                selectionOnDrag={selectionDragArmed}
                                panOnDrag={!selectionDragArmed}
                                onPaneClick={() => {
                                    setEdgeContextMenu(null);
                                    setElevatedEdgeIds([]);
                                    if (relationshipCreateMode) {
                                        setRelationshipCreateSelection([]);
                                    }
                                    if (selectionDragArmed)
                                        setSelectionDragArmed(false);
                                }}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onNodeClick={onNodeClickInCanvas}
                                onEdgeClick={onEdgeClick}
                                onNodeDragStop={onNodeDragStop}
                                onEdgesDelete={(deleted) => {
                                    deleteSelectionFromDoc(
                                        [],
                                        deleted.map((edge) => edge.id),
                                    );
                                }}
                                onEdgeContextMenu={onEdgeContextMenu}
                                onSelectionChange={onSelectionChange}
                            >
                                {!largeDiagram ? <MiniMap /> : null}
                                <Controls />
                                <Background />
                            </ReactFlow>
                            {edgeContextMenu ? (
                                <div
                                    ref={edgeContextMenuRef}
                                    className="erd-edge-context-menu"
                                    style={{
                                        position: "fixed",
                                        left: edgeContextMenu.clientX,
                                        top: edgeContextMenu.clientY,
                                        zIndex: 80,
                                    }}
                                    role="menu"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {(() => {
                                        const rel =
                                            doc.model.relationships.find(
                                                (r) =>
                                                    r.id ===
                                                    edgeContextMenu.edgeId,
                                            );
                                        const hidden =
                                            rel?.canvasLineHidden === true;
                                        const cardinality =
                                            rel?.cardinality ?? "1:N";
                                        return (
                                            <>
                                                <button
                                                    type="button"
                                                    className={`erd-edge-context-menu__item${cardinality === "1:1" ? " erd-edge-context-menu__item--active" : ""}`}
                                                    role="menuitemradio"
                                                    aria-checked={
                                                        cardinality === "1:1"
                                                    }
                                                    onClick={() => {
                                                        setRelationshipCardinality(
                                                            edgeContextMenu.edgeId,
                                                            "1:1",
                                                        );
                                                        setEdgeContextMenu(
                                                            null,
                                                        );
                                                    }}
                                                >
                                                    {t(
                                                        "context.edge.cardinality.oneToOne",
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`erd-edge-context-menu__item${cardinality === "1:N" ? " erd-edge-context-menu__item--active" : ""}`}
                                                    role="menuitemradio"
                                                    aria-checked={
                                                        cardinality === "1:N"
                                                    }
                                                    onClick={() => {
                                                        setRelationshipCardinality(
                                                            edgeContextMenu.edgeId,
                                                            "1:N",
                                                        );
                                                        setEdgeContextMenu(
                                                            null,
                                                        );
                                                    }}
                                                >
                                                    {t(
                                                        "context.edge.cardinality.oneToMany",
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="erd-edge-context-menu__item"
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setRelationshipCanvasLineHidden(
                                                            edgeContextMenu.edgeId,
                                                            !hidden,
                                                        );
                                                        setEdgeContextMenu(
                                                            null,
                                                        );
                                                    }}
                                                >
                                                    {hidden
                                                        ? t(
                                                              "context.edge.showLine",
                                                          )
                                                        : t(
                                                              "context.edge.hideLine",
                                                          )}
                                                </button>
                                            </>
                                        );
                                    })()}
                                </div>
                            ) : null}
                        </div>
                        {!hasDesign ? (
                            <div className="erd-canvas-empty-hint">
                                {t("canvas.emptyHint")}
                            </div>
                        ) : null}
                    </div>
                    {showRightPanel && panelVisible ? (
                        <aside
                            className="erd-right-panel"
                            aria-label={t("panel.title")}
                        >
                            <div className="erd-right-panel-header">
                                {t("panel.title")}
                            </div>
                            <div className="erd-right-panel-body">
                                <div
                                    style={{
                                        display: "grid",
                                        gap: 12,
                                        flex: 1,
                                        minHeight: 0,
                                    }}
                                >
                                    <label
                                        style={{
                                            display: "grid",
                                            gap: 4,
                                            fontSize: 12,
                                            color: "#475569",
                                        }}
                                    >
                                        {t("panel.projectName")}
                                        <input
                                            value={
                                                typeof doc.settings
                                                    ?.projectName === "string"
                                                    ? doc.settings.projectName
                                                    : ""
                                            }
                                            disabled={!hasDesign}
                                            onChange={(e) =>
                                                setDoc({
                                                    ...doc,
                                                    settings: {
                                                        ...(doc.settings ?? {}),
                                                        projectName:
                                                            e.target.value,
                                                    },
                                                })
                                            }
                                            style={{
                                                padding: "8px 10px",
                                                border: "1px solid #cbd5e1",
                                                borderRadius: 8,
                                            }}
                                        />
                                    </label>
                                    <label
                                        style={{
                                            display: "grid",
                                            gap: 4,
                                            fontSize: 12,
                                            color: "#475569",
                                        }}
                                    >
                                        {t("panel.projectDescription")}
                                        <textarea
                                            value={
                                                typeof doc.settings
                                                    ?.projectDescription ===
                                                "string"
                                                    ? doc.settings
                                                          .projectDescription
                                                    : ""
                                            }
                                            disabled={!hasDesign}
                                            onChange={(e) =>
                                                setDoc({
                                                    ...doc,
                                                    settings: {
                                                        ...(doc.settings ?? {}),
                                                        projectDescription:
                                                            e.target.value,
                                                    },
                                                })
                                            }
                                            style={{
                                                minHeight: 72,
                                                padding: "8px 10px",
                                                border: "1px solid #cbd5e1",
                                                borderRadius: 8,
                                            }}
                                        />
                                    </label>
                                    <label
                                        style={{
                                            display: "grid",
                                            gap: 4,
                                            fontSize: 12,
                                            color: "#475569",
                                        }}
                                    >
                                        {t("panel.rdbmsType")}
                                        <select
                                            value={doc.model.dialect}
                                            disabled={!hasDesign}
                                            onChange={(e) => {
                                                const nextDialect = e.target
                                                    .value as RdbmsDialect;
                                                if (
                                                    nextDialect ===
                                                    doc.model.dialect
                                                )
                                                    return;
                                                const ok = window.confirm(
                                                    t(
                                                        "dialog.confirm.dialectChange",
                                                    ),
                                                );
                                                if (!ok) return;
                                                setDoc(
                                                    convertDesignDialect(
                                                        doc,
                                                        nextDialect,
                                                        coreOptions,
                                                    ),
                                                );
                                            }}
                                            style={{
                                                padding: "8px 10px",
                                                border: "1px solid #cbd5e1",
                                                borderRadius: 8,
                                            }}
                                        >
                                            {dialectOptions.map((dialect) => (
                                                <option
                                                    key={dialect.id}
                                                    value={dialect.id}
                                                >
                                                    {dialect.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <div
                                        style={{
                                            display: "grid",
                                            gap: 8,
                                            borderTop: "1px solid #e2e8f0",
                                            paddingTop: 10,
                                            minHeight: 0,
                                            gridTemplateRows: "auto auto 1fr",
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: "#475569",
                                            }}
                                        >
                                            {t("panel.tables.title")}
                                        </div>
                                        <input
                                            value={panelTableQuery}
                                            disabled={!hasDesign}
                                            onChange={(e) =>
                                                setPanelTableQuery(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder={t(
                                                "panel.tables.searchPlaceholder",
                                            )}
                                            style={{
                                                padding: "8px 10px",
                                                border: "1px solid #cbd5e1",
                                                borderRadius: 8,
                                            }}
                                        />
                                        <div
                                            style={{
                                                border: "1px solid #e2e8f0",
                                                borderRadius: 8,
                                                minHeight: 0,
                                                overflow: "auto",
                                                background:
                                                    "var(--erd-surface)",
                                            }}
                                        >
                                            {!hasDesign ? (
                                                <div
                                                    style={{
                                                        padding: 10,
                                                        fontSize: 12,
                                                        color: "#64748b",
                                                    }}
                                                >
                                                    {t("panel.noDesignHint")}
                                                </div>
                                            ) : panelTables.length === 0 ? (
                                                <div
                                                    style={{
                                                        padding: 10,
                                                        fontSize: 12,
                                                        color: "#64748b",
                                                    }}
                                                >
                                                    {t("panel.tables.empty")}
                                                </div>
                                            ) : (
                                                panelTables.map((table) => (
                                                    <button
                                                        key={table.id}
                                                        type="button"
                                                        onClick={() =>
                                                            focusTableOnCanvas(
                                                                table.id,
                                                            )
                                                        }
                                                        style={{
                                                            width: "100%",
                                                            textAlign: "left",
                                                            border: "none",
                                                            background:
                                                                "transparent",
                                                            borderBottom:
                                                                "1px solid #f1f5f9",
                                                            padding: "8px 10px",
                                                            fontSize: 12,
                                                            color: "var(--erd-text)",
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {table.label}
                                                        </div>
                                                        <div
                                                            style={{
                                                                color: "#64748b",
                                                                marginTop: 2,
                                                            }}
                                                        >
                                                            {table.physicalName}
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </aside>
                    ) : null}
                </div>
                <TableEditDialog
                    open={Boolean(editingTableId && editingTable)}
                    table={editingTable}
                    dialect={doc.model.dialect}
                    displayMode={displayMode}
                    coreOptions={coreOptions}
                    onClose={() => setEditingTableId(null)}
                    onSave={(t) => {
                        setTableMeta(t.id, {
                            logicalName: t.logicalName,
                            physicalName: t.physicalName,
                            schemaName: t.schemaName ?? null,
                            color: t.color === undefined ? null : t.color,
                        });
                        setTableColumns(t.id, t.columns);
                    }}
                />
                <TableEditDialog
                    open={Boolean(creatingTableDraft)}
                    table={creatingTableDraft}
                    dialect={doc.model.dialect}
                    displayMode={displayMode}
                    coreOptions={coreOptions}
                    onClose={() => {
                        setCreatingTableDraft(null);
                        setCreateTableContext(null);
                    }}
                    onSave={(table) => {
                        idRef.current += 1;
                        const dropContext = createTableContext;
                        if (
                            dropContext?.mode === "edge-drop" &&
                            dropContext.flowX !== undefined &&
                            dropContext.flowY !== undefined
                        ) {
                            addTableAt(
                                table,
                                dropContext.flowX,
                                dropContext.flowY,
                            );
                            if (dropContext.sourceTableId) {
                                requestAnimationFrame(() => {
                                    const pkColumnIds =
                                        dropContext.sourcePrimaryColumnIds ??
                                        [];
                                    if (pkColumnIds.length === 0) {
                                        connectWithForeignKey(
                                            dropContext.sourceTableId!,
                                            table.id,
                                        );
                                        return;
                                    }
                                    for (const pkColumnId of pkColumnIds) {
                                        connectWithForeignKey(
                                            dropContext.sourceTableId!,
                                            table.id,
                                            pkColumnId,
                                        );
                                    }
                                });
                            }
                        } else {
                            addTableAt(
                                table,
                                120 + Math.random() * 80,
                                120 + Math.random() * 80,
                            );
                        }
                        setCreatingTableDraft(null);
                        setCreateTableContext(null);
                    }}
                />
                {newErDialogOpen ? (
                    <div className="erd-dialog-backdrop" role="presentation">
                        <div
                            className="erd-dialog"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="erd-new-dialog-title"
                            style={{ width: "min(560px, 100%)" }}
                        >
                            <div className="erd-dialog-header">
                                <span id="erd-new-dialog-title">
                                    {t("dialog.newEr.title")}
                                </span>
                            </div>
                            <div
                                className="erd-dialog-body"
                                style={{ display: "grid", gap: 12 }}
                            >
                                <label
                                    style={{
                                        display: "grid",
                                        gap: 4,
                                        fontSize: 12,
                                        color: "#475569",
                                    }}
                                >
                                    {t("panel.projectName")}
                                    <input
                                        className="erd-input"
                                        value={newErDraft.projectName}
                                        onChange={(e) =>
                                            setNewErDraft((prev) => ({
                                                ...prev,
                                                projectName: e.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <label
                                    style={{
                                        display: "grid",
                                        gap: 4,
                                        fontSize: 12,
                                        color: "#475569",
                                    }}
                                >
                                    {t("panel.projectDescription")}
                                    <textarea
                                        className="erd-input"
                                        value={newErDraft.projectDescription}
                                        onChange={(e) =>
                                            setNewErDraft((prev) => ({
                                                ...prev,
                                                projectDescription:
                                                    e.target.value,
                                            }))
                                        }
                                        style={{ minHeight: 90 }}
                                    />
                                </label>
                                <label
                                    style={{
                                        display: "grid",
                                        gap: 4,
                                        fontSize: 12,
                                        color: "#475569",
                                    }}
                                >
                                    {t("panel.rdbmsType")}
                                    <select
                                        className="erd-select"
                                        value={newErDraft.dialect}
                                        onChange={(e) =>
                                            setNewErDraft((prev) => ({
                                                ...prev,
                                                dialect: e.target
                                                    .value as RdbmsDialect,
                                            }))
                                        }
                                    >
                                        {dialectOptions.map((dialect) => (
                                            <option
                                                key={dialect.id}
                                                value={dialect.id}
                                            >
                                                {dialect.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <div className="erd-dialog-footer">
                                <button
                                    type="button"
                                    className="erd-btn erd-btn--ghost"
                                    onClick={() => setNewErDialogOpen(false)}
                                >
                                    {t("dialog.cancel")}
                                </button>
                                <button
                                    type="button"
                                    className="erd-btn erd-btn--primary"
                                    onClick={createNewErFromDraft}
                                >
                                    {t("dialog.newEr.create")}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    },
);

const ERDDesignerInner = forwardRef<ERDDesignerHandle, ERDDesignerProps>(
    function ERDDesignerInner({ locale, translations, t, ...rest }, ref) {
        return (
            <ErdI18nProvider locale={locale} translations={translations} t={t}>
                <ERDDesignerShell ref={ref} {...rest} />
            </ErdI18nProvider>
        );
    },
);

export const ERDDesigner = forwardRef<ERDDesignerHandle, ERDDesignerProps>(
    (props, ref) => (
        <ReactFlowProvider>
            <ERDDesignerInner {...props} ref={ref} />
        </ReactFlowProvider>
    ),
);
