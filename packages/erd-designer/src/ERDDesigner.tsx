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
    getSmoothStepPath,
    type EdgeProps,
    type OnConnectEnd,
    type OnConnectStart,
    type OnEdgeMouseHandler,
    type OnEdgeContextMenu,
    type ReactFlowInstance,
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
    TABLE_RELATIONSHIP_SOURCE_HANDLE_ID,
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

function RelationshipEdge({
    id,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    style,
    className,
    data,
}: EdgeProps) {
    const [path] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 10,
        offset: 18,
    });
    const cardinality =
        (data as RelationshipEdgeData | undefined)?.cardinality ?? "1:N";
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
                        const dx = targetX - sourceX;
                        const dy = targetY - sourceY;
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
        </g>
    );
}

const HANDLE_TOP = 12;
/** Approximate layout of table node body for left handle Y (aligns with first column row center). */
const NODE_HEADER_PX = 39;
const NODE_BODY_PAD_TOP = 2;
const NODE_ROW_PX = 36;

function targetRowCenterTopPx(
    rowIndex: number,
    columnCount: number,
): number {
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
    const formatPhysicalTableName = useCallback((table: TableModel) => {
        return table.schemaName?.trim()
            ? `${table.schemaName.trim()}.${table.physicalName}`
            : table.physicalName;
    }, []);
    const {
        table,
        compact,
        displayMode,
        onEditTable,
        physicalTitle,
        relationshipEndpointHighlight,
    } = data;
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
            onDoubleClick={(e) => {
                e.stopPropagation();
                onEditTable(table.id);
            }}
        >
            <Handle
                id={TABLE_RELATIONSHIP_SOURCE_HANDLE_ID}
                type="source"
                position={Position.Right}
                className="erd-handle-dot"
                style={{ top: HANDLE_TOP, right: -6 }}
                aria-label="edge-source"
            />
            {compact
                ? table.columns.map((col, rowIndex) =>
                      col.isForeignKey ? (
                          <Handle
                              key={col.id}
                              id={targetFkColumnHandleId(col.id)}
                              type="target"
                              position={Position.Left}
                              className="erd-handle-dot erd-handle-dot--fk"
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
                                    <Handle
                                        id={targetFkColumnHandleId(col.id)}
                                        type="target"
                                        position={Position.Left}
                                        className="erd-handle-dot erd-handle-dot--fk"
                                        isConnectableStart={false}
                                        style={{
                                            position: "absolute",
                                            left: 0,
                                            top: "50%",
                                            transform: "translate(-50%, -50%)",
                                        }}
                                        aria-label={`edge-target-${col.id}`}
                                    />
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

/**
 * Host toolbar inserts in **left-to-right order** between built-in groups.
 * See toolbar JSX in `ERDDesigner` for exact boundaries.
 *
 * 1. `slot1` — before the built-in **file** group (New ER, save, PDF, image, DDL).
 * 2. `slot2` — after the file block (and optional copy hint), before **tools** (add table, delete selection).
 * 3. `slot3` — after tools, before **view** (logical/physical, reveal hidden relationship lines).
 * 4. `slot4` — after view, before **edit** (multi-select, copy/paste, undo/redo).
 * 5. `slot5` — after edit, before **align** (align/distribute, fit view).
 * `trailing` — right cluster (`margin-left: auto`), before `toolbarExtra` and the panel toggle. Wrap in `div.erd-toolbar-group` if you want a separate visual group.
 */
export type ToolbarSlots = {
    slot1?: React.ReactNode;
    slot2?: React.ReactNode;
    slot3?: React.ReactNode;
    slot4?: React.ReactNode;
    slot5?: React.ReactNode;
    trailing?: React.ReactNode;
};

export interface ERDDesignerProps {
    value?: DesignDocument;
    onChange?: (doc: DesignDocument) => void;
    onSaveJson?: (doc: DesignDocument) => void;
    onRequestNewEr?: (currentDialect: RdbmsDialect) => void;
    /** 엣지를 빈 캔버스에 드롭했을 때(흐름 좌표·화면 좌표). 새 테이블 UI는 호스트에서 연다. */
    onRequestCreateTable?: (payload: CreateTableRequestPayload) => void;
    /** Extra host nodes in the right toolbar row, after `toolbarSlots.trailing` and before the panel toggle. */
    toolbarExtra?: React.ReactNode;
    toolbarSlots?: ToolbarSlots;
    largeDiagramThreshold?: number;
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
            toolbarSlots,
            toolbarExtra,
            largeDiagramThreshold = 120,
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
        const removeTable = useDesignerStore((s) => s.removeTable);
        const addRelationship = useDesignerStore((s) => s.addRelationship);
        const removeRelationship = useDesignerStore(
            (s) => s.removeRelationship,
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

        const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
        const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
        const [relationshipCardinalityMode, setRelationshipCardinalityMode] =
            useState<RelationshipModel["cardinality"]>("1:N");
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
            queueMicrotask(() => {
                docSyncFromValueRef.current = false;
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
                const t = e.target as Node | null;
                if (el && t && el.contains(t)) return;
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
        const largeDiagram = tableCount >= largeDiagramThreshold;
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
            ],
        );

        const flowEdges: Edge<RelationshipEdgeData>[] = useMemo(() => {
            if (!hasDesign) return [];
            return buildRelationshipFlowEdges(
                doc.model,
                revealHiddenRelationshipLines,
            );
        }, [doc.model, hasDesign, revealHiddenRelationshipLines]);

        const diagramSignature = useMemo(
            () =>
                `${revealHiddenRelationshipLines ? 1 : 0}:${largeDiagram ? 1 : 0}:${displayMode}:${serializeDesign(doc)}`,
            [
                displayMode,
                doc,
                largeDiagram,
                revealHiddenRelationshipLines,
            ],
        );

        const [nodes, setNodes] = useState<Node<TableNodeData>[]>(flowNodes);
        const [edges, setEdges] = useState<Edge[]>(flowEdges);

        const flowNodesRef = useRef(flowNodes);
        const flowEdgesRef = useRef(flowEdges);
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
        }, [diagramSignature]);

        useEffect(() => {
            const elevated = new Set(elevatedEdgeIds);
            setEdges((prev) =>
                prev.map((edge) => {
                    const raw = edge.className ?? "";
                    const withoutFlag = raw
                        .split(" ")
                        .filter(
                            (name) =>
                                name.length > 0 &&
                                name !== "erd-edge-elevated",
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
                setNodes((nds) => applyNodeChanges(changes, nds));
            },
            [],
        );

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

        const onEdgeClick = useCallback<OnEdgeMouseHandler>(
            (_event, edge) => {
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

        const onEdgeContextMenu = useCallback<OnEdgeContextMenu>(
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
                const sourceTable = doc.model.tables.find(
                    (t) => t.id === sourceTableId,
                );
                const targetTable = doc.model.tables.find(
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
                            doc.model.dialect,
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

                    const relExists = doc.model.relationships.some(
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
                    });
                }
            },
            [
                addRelationship,
                coreOptions,
                doc.model.dialect,
                doc.model.tables,
                hasDesign,
                relationshipCardinalityMode,
                setTableColumns,
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

        /** Deletes selected relationship edges first, then selected tables (one action). */
        const deleteSelectedSelection = useCallback(() => {
            if (!hasDesign) return;
            if (selectedEdgeIds.length === 0 && selectedNodeIds.length === 0)
                return;
            const selectedEdgeSet = new Set(selectedEdgeIds);
            const targetEdges = edges.filter((edge) =>
                selectedEdgeSet.has(edge.id),
            );
            for (const edge of targetEdges) {
                const relIds = (edge.data as RelationshipEdgeData | undefined)
                    ?.relationshipIds;
                if (relIds && relIds.length > 0) {
                    for (const relId of relIds) removeRelationship(relId);
                } else {
                    removeRelationship(edge.id);
                }
            }
            for (const id of selectedNodeIds) {
                removeTable(id);
            }
            setSelectedEdgeIds([]);
            setSelectedNodeIds([]);
        }, [
            edges,
            hasDesign,
            removeRelationship,
            removeTable,
            selectedEdgeIds,
            selectedNodeIds,
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
                const centerX = pos.x + 126;
                const centerY = pos.y + 22;
                void inst.setCenter(centerX, centerY, { duration: 260 });
            },
            [doc.layout.nodePositions],
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
                const canvasEl = host.querySelector(selector) as HTMLElement | null;
                if (!canvasEl) continue;
                try {
                    const blob = await toBlob(canvasEl, {
                        cacheBust: true,
                        pixelRatio: 2,
                        backgroundColor: "#ffffff",
                        filter: (node) => {
                            if (!(node instanceof HTMLElement)) return true;
                            if (
                                node.classList.contains("erd-edge-context-menu") ||
                                node.classList.contains("react-flow__controls") ||
                                node.classList.contains("react-flow__minimap") ||
                                node.classList.contains("react-flow__attribution") ||
                                node.classList.contains("react-flow__selection") ||
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
                    {toolbarSlots?.slot1 ? (
                        <>
                            <div className="erd-toolbar-group">
                                {toolbarSlots.slot1}
                            </div>
                            <span className="erd-toolbar-sep" />
                        </>
                    ) : null}
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
                    {toolbarSlots?.slot2 ? (
                        <>
                            <span className="erd-toolbar-sep" />
                            <div className="erd-toolbar-group">
                                {toolbarSlots.slot2}
                            </div>
                        </>
                    ) : null}
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
                    {toolbarSlots?.slot3 ? (
                        <>
                            <span className="erd-toolbar-sep" />
                            <div className="erd-toolbar-group">
                                {toolbarSlots.slot3}
                            </div>
                        </>
                    ) : null}
                    <span className="erd-toolbar-sep" />
                    <div className="erd-toolbar-group">
                        <button
                            type="button"
                            className={`erd-toolbar-btn${relationshipCardinalityMode === "1:1" ? " erd-toolbar-btn--active" : ""}`}
                            onClick={() => setRelationshipCardinalityMode("1:1")}
                            aria-pressed={
                                relationshipCardinalityMode === "1:1"
                            }
                            title={t("toolbar.cardinality.oneToOne")}
                            disabled={toolbarDisabled}
                        >
                            {t("toolbar.cardinality.oneToOne")}
                        </button>
                        <button
                            type="button"
                            className={`erd-toolbar-btn${relationshipCardinalityMode === "1:N" ? " erd-toolbar-btn--active" : ""}`}
                            onClick={() => setRelationshipCardinalityMode("1:N")}
                            aria-pressed={
                                relationshipCardinalityMode === "1:N"
                            }
                            title={t("toolbar.cardinality.oneToMany")}
                            disabled={toolbarDisabled}
                        >
                            {t("toolbar.cardinality.oneToMany")}
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
                    {toolbarSlots?.slot4 ? (
                        <>
                            <span className="erd-toolbar-sep" />
                            <div className="erd-toolbar-group">
                                {toolbarSlots.slot4}
                            </div>
                        </>
                    ) : null}
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
                    {toolbarSlots?.slot5 ? (
                        <>
                            <span className="erd-toolbar-sep" />
                            <div className="erd-toolbar-group">
                                {toolbarSlots.slot5}
                            </div>
                        </>
                    ) : null}
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
                    {toolbarSlots?.trailing ||
                    toolbarExtra ||
                    showRightPanel ? (
                        <div
                            style={{
                                marginLeft: "auto",
                                display: "flex",
                                gap: 6,
                                alignItems: "center",
                                flexWrap: "wrap",
                            }}
                        >
                            {toolbarSlots?.trailing}
                            {toolbarExtra}
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
                                    if (selectionDragArmed)
                                        setSelectionDragArmed(false);
                                }}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onNodeClick={() => {
                                    setElevatedEdgeIds([]);
                                }}
                                onEdgeClick={onEdgeClick}
                                onNodeDragStop={onNodeDragStop}
                                onConnectStart={onConnectStart}
                                onConnect={onConnect}
                                onEdgesDelete={(deleted) => {
                                    for (const edge of deleted) {
                                        const relIds = (
                                            edge.data as
                                                | RelationshipEdgeData
                                                | undefined
                                        )?.relationshipIds;
                                        if (relIds && relIds.length > 0) {
                                            for (const relId of relIds)
                                                removeRelationship(relId);
                                        } else {
                                            removeRelationship(edge.id);
                                        }
                                    }
                                }}
                                onConnectEnd={onConnectEnd}
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
                                        const rel = doc.model.relationships.find(
                                            (r) =>
                                                r.id === edgeContextMenu.edgeId,
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
                                                        setEdgeContextMenu(null);
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
                                                        setEdgeContextMenu(null);
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
                                                        setEdgeContextMenu(null);
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
                        if (
                            createTableContext?.mode === "edge-drop" &&
                            createTableContext.flowX !== undefined &&
                            createTableContext.flowY !== undefined
                        ) {
                            addTableAt(
                                table,
                                createTableContext.flowX,
                                createTableContext.flowY,
                            );
                            if (createTableContext.sourceTableId) {
                                requestAnimationFrame(() => {
                                    for (const pkColumnId of createTableContext.sourcePrimaryColumnIds ??
                                        []) {
                                        connectWithForeignKey(
                                            createTableContext.sourceTableId!,
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
