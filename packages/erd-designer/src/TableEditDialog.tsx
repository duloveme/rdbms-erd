"use client";

import {
    type CoreDbMetaOptions,
    createColumn,
    dialectSupportsSchema,
    defaultPhysicalType,
    type ColumnModel,
    LOGICAL_DATA_TYPES,
    LogicalDataType,
    RdbmsDialect,
    resolveDialectMetas,
    type TableModel,
} from "@rdbms-erd/core";
import {
    ChevronDown,
    ChevronUp,
    Eraser,
    GripVertical,
    KeyRound,
    Link2,
    Trash2,
    X,
} from "lucide-react";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { CanvasDisplayMode } from "./ERDDesigner";
import { createId } from "./id";
import { useErdTranslator } from "./i18n/I18nContext";
import type { I18nKey, I18nVars } from "./i18n/types";
import {
    columnNamesBlank,
    normalizeTableEditForSave,
    patchColumnOnPhysicalTypeUserEdit,
    syncTableEditDraftOnOpen,
    syncTableEditDraftOnSwitchToLogical,
    syncTableEditDraftOnSwitchToPhysical,
} from "./tableEditDraftSync";

export interface TableEditDialogProps {
    open: boolean;
    table: TableModel | null;
    dialect: RdbmsDialect;
    displayMode: CanvasDisplayMode;
    onClose: () => void;
    onSave: (table: TableModel) => void;
    /** When used outside `ERDDesigner`, pass these or wrap with `ErdI18nProvider`. */
    locale?: string;
    translations?: Partial<Record<I18nKey, string>>;
    t?: (key: I18nKey, vars?: I18nVars) => string;
    coreOptions?: CoreDbMetaOptions;
    /** 저장 시 이 목록과 논리명·물리명(스키마+물리) 중복을 검사한다. 현재 `table.id`는 제외한다. */
    tablesForDuplicateCheck?: TableModel[];
    /** @deprecated Prefer `coreOptions.defaultPhysicalTypes`. Merged into `coreOptions` when set. */
    defaultPhysicalTypes?: Partial<Record<LogicalDataType, string>>;
}

type ColumnFocusField = "name" | "type" | "description";

function focusAndSelectTextInput(el: HTMLElement) {
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        queueMicrotask(() => {
            el.select();
        });
    }
}

function cloneTable(t: TableModel): TableModel {
    return {
        ...t,
        columns: t.columns.map((c) => ({ ...c })),
    };
}

/** 물리 식별: 스키마(있으면)+물리명, 소문자·trim. 물리명이 비면 빈 문자열(중복 검사 제외). */
function tablePhysicalIdentityKey(table: TableModel): string {
    const s = table.schemaName?.trim().toLowerCase() ?? "";
    const p = table.physicalName?.trim().toLowerCase() ?? "";
    if (!p) return "";
    return s ? `${s}\0${p}` : p;
}

function tableDuplicateSaveErrorMessage(
    normalized: TableModel,
    allTables: TableModel[],
    tr: (key: I18nKey, vars?: I18nVars) => string,
): string | null {
    if (allTables.length === 0) return null;
    const selfId = normalized.id;
    const opponents = allTables.filter((t) => t.id !== selfId);
    const lk = normalized.logicalName?.trim().toLowerCase() ?? "";
    if (
        lk &&
        opponents.some(
            (t) => (t.logicalName?.trim().toLowerCase() ?? "") === lk,
        )
    ) {
        return tr("dialog.tableEdit.errorDuplicateLogical");
    }
    const pk = tablePhysicalIdentityKey(normalized);
    if (pk && opponents.some((t) => tablePhysicalIdentityKey(t) === pk)) {
        return tr("dialog.tableEdit.errorDuplicatePhysical");
    }
    return null;
}

function createBlankColumn(
    dialect: RdbmsDialect,
    coreOptions?: CoreDbMetaOptions,
): ColumnModel {
    return createColumn(
        dialect,
        {
            id: createId("col"),
            logicalName: "",
            logicalType: "TEXT",
            physicalName: "",
            nullable: true,
        },
        coreOptions,
    );
}

function ensureTrailingBlankColumn(
    draft: TableModel,
    dialect: RdbmsDialect,
    coreOptions?: CoreDbMetaOptions,
): TableModel {
    const cols = [...draft.columns];
    while (
        cols.length >= 2 &&
        columnNamesBlank(cols[cols.length - 1]!) &&
        columnNamesBlank(cols[cols.length - 2]!)
    ) {
        cols.pop();
    }
    if (cols.length === 0 || !columnNamesBlank(cols[cols.length - 1]!)) {
        cols.push(createBlankColumn(dialect, coreOptions));
    }
    return { ...draft, columns: cols };
}

type TableEditPendingConfirm =
    | { kind: "close" }
    | { kind: "deleteColumn"; index: number };

export function TableEditDialog({
    open,
    table,
    dialect,
    displayMode,
    onClose,
    onSave,
    locale,
    translations,
    t: tProp,
    coreOptions,
    tablesForDuplicateCheck,
    defaultPhysicalTypes: defaultPhysicalTypesProp,
}: TableEditDialogProps) {
    const { t } = useErdTranslator({ locale, translations, t: tProp });
    const resolvedCoreOptions = useMemo(
        (): CoreDbMetaOptions | undefined =>
            defaultPhysicalTypesProp
                ? {
                      ...coreOptions,
                      defaultPhysicalTypes: {
                          ...coreOptions?.defaultPhysicalTypes,
                          ...defaultPhysicalTypesProp,
                      },
                  }
                : coreOptions,
        [coreOptions, defaultPhysicalTypesProp],
    );
    const [draft, setDraft] = useState<TableModel | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [dialogDisplayMode, setDialogDisplayMode] =
        useState<CanvasDisplayMode>(displayMode);
    const [draggingColumnIndex, setDraggingColumnIndex] = useState<
        number | null
    >(null);
    const [pendingConfirm, setPendingConfirm] =
        useState<TableEditPendingConfirm | null>(null);
    const columnFieldRegistryRef = useRef(new Map<string, HTMLElement>());
    const tableDescriptionInputRef = useRef<HTMLInputElement | null>(null);
    const [userEdited, setUserEdited] = useState(false);

    const registerColumnField = useCallback(
        (row: number, field: ColumnFocusField, el: HTMLElement | null) => {
            const key = `${field}:${row}`;
            if (el) columnFieldRegistryRef.current.set(key, el);
            else columnFieldRegistryRef.current.delete(key);
        },
        [],
    );

    const focusNextColumnField = useCallback(
        (row: number, field: ColumnFocusField, columnCount: number) => {
            for (let r = row + 1; r < columnCount; r++) {
                const next = columnFieldRegistryRef.current.get(
                    `${field}:${r}`,
                );
                if (next) {
                    focusAndSelectTextInput(next);
                    return;
                }
            }
        },
        [],
    );

    const focusFirstColumnNameField = useCallback(() => {
        const el = columnFieldRegistryRef.current.get("name:0");
        if (el) focusAndSelectTextInput(el);
    }, []);

    const focusTableDescriptionField = useCallback(() => {
        const el = tableDescriptionInputRef.current;
        if (el) focusAndSelectTextInput(el);
    }, []);

    useEffect(() => {
        if (open && table) {
            let next = ensureTrailingBlankColumn(
                cloneTable(table),
                dialect,
                resolvedCoreOptions,
            );
            next = syncTableEditDraftOnOpen(
                next,
                dialect,
                resolvedCoreOptions,
                displayMode,
            );
            setDraft(next);
            setUserEdited(false);
        }
    }, [displayMode, dialect, open, resolvedCoreOptions, table]);

    useEffect(() => {
        if (!open) return;
        setDialogDisplayMode(displayMode);
    }, [displayMode, open]);

    useEffect(() => {
        if (!open) setPendingConfirm(null);
    }, [open]);

    const switchDialogToLogicalMode = useCallback(() => {
        setDraft((d) =>
            d
                ? syncTableEditDraftOnSwitchToLogical(
                      d,
                      dialect,
                      resolvedCoreOptions,
                  )
                : d,
        );
        setDialogDisplayMode("logical");
    }, [dialect, resolvedCoreOptions]);

    const switchDialogToPhysicalMode = useCallback(() => {
        setDraft((d) =>
            d
                ? syncTableEditDraftOnSwitchToPhysical(
                      d,
                      dialect,
                      resolvedCoreOptions,
                  )
                : d,
        );
        setDialogDisplayMode("physical");
    }, [dialect, resolvedCoreOptions]);

    const requestClose = useCallback(() => {
        if (!userEdited) {
            onClose();
            return;
        }
        setPendingConfirm({ kind: "close" });
    }, [onClose, userEdited]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (
                mod &&
                e.shiftKey &&
                (e.key === "ArrowUp" || e.key === "ArrowDown")
            ) {
                e.preventDefault();
                if (e.key === "ArrowUp") {
                    switchDialogToLogicalMode();
                } else {
                    switchDialogToPhysicalMode();
                }
                return;
            }
            if (e.key !== "Escape") return;
            e.preventDefault();
            if (pendingConfirm) {
                setPendingConfirm(null);
                return;
            }
            requestClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        open,
        pendingConfirm,
        requestClose,
        switchDialogToLogicalMode,
        switchDialogToPhysicalMode,
    ]);

    useEffect(() => {
        setSaveError(null);
    }, [
        open,
        table?.id,
        draft?.logicalName,
        draft?.physicalName,
        draft?.schemaName,
    ]);

    const handleAttemptSave = useCallback(() => {
        if (!draft) return;
        const normalized = normalizeTableEditForSave(
            draft,
            dialect,
            resolvedCoreOptions,
            dialogDisplayMode,
        );
        if (tablesForDuplicateCheck && tablesForDuplicateCheck.length > 0) {
            const dupMsg = tableDuplicateSaveErrorMessage(
                normalized,
                tablesForDuplicateCheck,
                t,
            );
            if (dupMsg) {
                setSaveError(dupMsg);
                return;
            }
        }
        setSaveError(null);
        onSave(normalized);
        onClose();
    }, [
        coreOptions,
        dialogDisplayMode,
        draft,
        dialect,
        onClose,
        onSave,
        resolvedCoreOptions,
        t,
        tablesForDuplicateCheck,
    ]);

    const title = useMemo(() => {
        if (!draft) return t("dialog.tableEdit.fallbackTitle");
        const name =
            dialogDisplayMode === "logical"
                ? draft.logicalName
                : draft.physicalName;
        return t("dialog.tableEdit.titleWithName", { name });
    }, [dialogDisplayMode, draft, t]);

    if (!open || !table || !draft) return null;

    const markUserEdited = () => setUserEdited(true);

    const updateColumn = (index: number, patch: Partial<ColumnModel>) => {
        markUserEdited();
        setDraft((d) => {
            if (!d) return d;
            const cols = [...d.columns];
            cols[index] = { ...cols[index], ...patch };
            return ensureTrailingBlankColumn(
                { ...d, columns: cols },
                dialect,
                resolvedCoreOptions,
            );
        });
    };

    const moveColumn = (index: number, dir: -1 | 1) => {
        markUserEdited();
        setDraft((d) => {
            if (!d) return d;
            const j = index + dir;
            if (j < 0 || j >= d.columns.length) return d;
            const target = d.columns[j];
            const from = d.columns[index];
            if (!target || !from) return d;
            // 마지막 빈 컬럼 아래로 이동 금지(빈 컬럼 자체도 이동 금지)
            if (columnNamesBlank(target) || columnNamesBlank(from)) return d;
            const cols = [...d.columns];
            [cols[index], cols[j]] = [cols[j], cols[index]];
            return ensureTrailingBlankColumn(
                { ...d, columns: cols },
                dialect,
                resolvedCoreOptions,
            );
        });
    };

    const moveColumnTo = (fromIndex: number, toIndex: number) => {
        markUserEdited();
        setDraft((d) => {
            if (!d) return d;
            if (fromIndex < 0 || fromIndex >= d.columns.length) return d;
            const fromCol = d.columns[fromIndex];
            if (!fromCol || columnNamesBlank(fromCol)) return d;
            const namedIndexes = d.columns
                .map((c, i) => ({ c, i }))
                .filter(({ c }) => !columnNamesBlank(c))
                .map(({ i }) => i);
            if (namedIndexes.length === 0) return d;
            const maxNamedIndex = namedIndexes[namedIndexes.length - 1] ?? 0;
            const clampedTo = Math.max(0, Math.min(toIndex, maxNamedIndex));
            if (clampedTo === fromIndex) return d;
            const cols = [...d.columns];
            const [moved] = cols.splice(fromIndex, 1);
            if (!moved) return d;
            cols.splice(clampedTo, 0, moved);
            return ensureTrailingBlankColumn(
                { ...d, columns: cols },
                dialect,
                resolvedCoreOptions,
            );
        });
    };

    const removeColumn = (index: number) => {
        markUserEdited();
        setDraft((d) => {
            if (!d || d.columns.length <= 1) return d;
            return ensureTrailingBlankColumn(
                { ...d, columns: d.columns.filter((_, i) => i !== index) },
                dialect,
                resolvedCoreOptions,
            );
        });
    };

    const requestRemoveColumn = (index: number) => {
        setPendingConfirm({ kind: "deleteColumn", index });
    };

    const nameCaption = t("dialog.tableName");
    const descriptionCaption = t("dialog.tableDescription");
    const getColumnName = (index: number) =>
        dialogDisplayMode === "logical"
            ? draft.columns[index].logicalName
            : draft.columns[index].physicalName;

    const setColumnName = (index: number, value: string) => {
        if (dialogDisplayMode === "logical") {
            updateColumn(index, { logicalName: value });
            return;
        }
        updateColumn(index, { physicalName: value });
    };

    const oppositeTableNamePlaceholder =
        dialogDisplayMode === "logical"
            ? (draft.physicalName?.trim() ?? "")
            : (draft.logicalName?.trim() ?? "");

    const gridClass =
        dialogDisplayMode === "physical"
            ? "erd-dialog-col-grid erd-dialog-col-grid--physical"
            : "erd-dialog-col-grid erd-dialog-col-grid--logical";
    const supportsSchema = dialectSupportsSchema(dialect, resolvedCoreOptions);
    const logicalTypes =
        resolveDialectMetas(resolvedCoreOptions)
            .find((m) => m.id === dialect)
            ?.logicalTypes.map((lt) => lt.id) ?? LOGICAL_DATA_TYPES;

    const confirmDialog =
        pendingConfirm?.kind === "close" ? (
            <div
                className="erd-dialog-backdrop erd-dialog-backdrop--nested"
                role="presentation"
            >
                <div
                    className="erd-dialog"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="erd-table-edit-close-confirm-title"
                    style={{ width: "min(520px, 100%)", height: "auto" }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="erd-dialog-header">
                        <span id="erd-table-edit-close-confirm-title">
                            {t("dialog.confirm.tableEdit.closeTitle")}
                        </span>
                    </div>
                    <div className="erd-dialog-body">
                        <p
                            style={{
                                margin: 0,
                                fontSize: 14,
                                whiteSpace: "pre-line",
                                lineHeight: 1.45,
                            }}
                        >
                            {t("dialog.confirm.tableEdit.close")}
                        </p>
                    </div>
                    <div className="erd-dialog-footer">
                        <button
                            type="button"
                            className="erd-btn erd-btn--primary"
                            onClick={() => {
                                setPendingConfirm(null);
                                onClose();
                            }}
                        >
                            {t("dialog.confirm.tableEdit.discard")}
                        </button>
                        <button
                            type="button"
                            className="erd-btn erd-btn--ghost"
                            onClick={() => setPendingConfirm(null)}
                        >
                            {t("dialog.cancel")}
                        </button>
                    </div>
                </div>
            </div>
        ) : pendingConfirm?.kind === "deleteColumn" ? (
            <div
                className="erd-dialog-backdrop erd-dialog-backdrop--nested"
                role="presentation"
            >
                <div
                    className="erd-dialog"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="erd-table-edit-delete-col-title"
                    style={{ width: "min(520px, 100%)", height: "auto" }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="erd-dialog-header">
                        <span id="erd-table-edit-delete-col-title">
                            {t("dialog.confirm.columnDelete.title")}
                        </span>
                    </div>
                    <div className="erd-dialog-body">
                        <p
                            style={{
                                margin: 0,
                                fontSize: 14,
                                lineHeight: 1.45,
                            }}
                        >
                            {t("dialog.confirm.columnDelete")}
                        </p>
                    </div>
                    <div className="erd-dialog-footer">
                        <button
                            type="button"
                            className="erd-btn erd-btn--primary"
                            onClick={() => {
                                removeColumn(pendingConfirm.index);
                                setPendingConfirm(null);
                            }}
                        >
                            {t("dialog.confirm.columnDelete.confirm")}
                        </button>
                        <button
                            type="button"
                            className="erd-btn erd-btn--ghost"
                            onClick={() => setPendingConfirm(null)}
                        >
                            {t("dialog.cancel")}
                        </button>
                    </div>
                </div>
            </div>
        ) : null;

    return (
        <>
        <div className="erd-dialog-backdrop" role="presentation">
            <div
                className="erd-dialog erd-dialog--table-edit"
                role="dialog"
                aria-modal="true"
                aria-labelledby="erd-table-dialog-title"
            >
                <div className="erd-dialog-header">
                    <span id="erd-table-dialog-title">{title}</span>
                    <div className="erd-dialog-header-actions">
                        <button
                            type="button"
                            className={`erd-dialog-mode-btn${dialogDisplayMode === "logical" ? " erd-dialog-mode-btn--active" : ""}`}
                            title={t("dialog.tableEdit.modeLogicalWithShortcut")}
                            onClick={switchDialogToLogicalMode}
                        >
                            {t("toolbar.mode.logical")}
                        </button>
                        <button
                            type="button"
                            className={`erd-dialog-mode-btn${dialogDisplayMode === "physical" ? " erd-dialog-mode-btn--active" : ""}`}
                            title={t("dialog.tableEdit.modePhysicalWithShortcut")}
                            onClick={switchDialogToPhysicalMode}
                        >
                            {t("toolbar.mode.physical")}
                        </button>
                        <button
                            type="button"
                            className="erd-node-header-btn"
                            aria-label={t("dialog.close")}
                            onClick={requestClose}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
                <div className="erd-dialog-body erd-dialog-body--table-edit">
                    <div className="erd-field">
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    dialogDisplayMode === "physical" &&
                                    supportsSchema
                                        ? "minmax(120px, 0.4fr) minmax(0, 1fr) minmax(0, 2fr) auto auto"
                                        : "minmax(0, 1fr) minmax(0, 2fr) auto auto",
                                gap: 8,
                                alignItems: "end",
                            }}
                        >
                            {dialogDisplayMode === "physical" &&
                            supportsSchema ? (
                                <div
                                    style={{
                                        display: "grid",
                                        gap: 4,
                                    }}
                                >
                                    <label htmlFor="erd-t-schema">
                                        {t("dialog.tableSchema")}
                                    </label>
                                    <input
                                        id="erd-t-schema"
                                        className="erd-input"
                                        value={draft.schemaName ?? ""}
                                        onChange={(e) => {
                                            markUserEdited();
                                            setDraft({
                                                ...draft,
                                                schemaName: e.target.value,
                                            });
                                        }}
                                        placeholder={t("dialog.tableSchema")}
                                    />
                                </div>
                            ) : null}
                            <div
                                style={{
                                    display: "grid",
                                    gap: 4,
                                }}
                            >
                                <label htmlFor="erd-t-name">{nameCaption}</label>
                                <input
                                    id="erd-t-name"
                                    className="erd-input"
                                    value={
                                        dialogDisplayMode === "logical"
                                            ? draft.logicalName
                                            : draft.physicalName
                                    }
                                    placeholder={oppositeTableNamePlaceholder}
                                    onChange={(e) => {
                                        markUserEdited();
                                        const nextName = e.target.value;
                                        if (dialogDisplayMode === "logical") {
                                            setDraft({
                                                ...draft,
                                                logicalName: nextName,
                                            });
                                        } else {
                                            setDraft({
                                                ...draft,
                                                physicalName: nextName,
                                            });
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key !== "Tab" || e.shiftKey)
                                            return;
                                        e.preventDefault();
                                        focusTableDescriptionField();
                                    }}
                                />
                            </div>
                            <div
                                style={{
                                    display: "grid",
                                    gap: 4,
                                }}
                            >
                                <label htmlFor="erd-t-description">
                                    {descriptionCaption}
                                </label>
                                <input
                                    id="erd-t-description"
                                    ref={tableDescriptionInputRef}
                                    className="erd-input"
                                    value={draft.description ?? ""}
                                    onChange={(e) => {
                                        markUserEdited();
                                        setDraft({
                                            ...draft,
                                            description: e.target.value,
                                        });
                                    }}
                                    placeholder={descriptionCaption}
                                    onKeyDown={(e) => {
                                        if (e.key === "Tab" && !e.shiftKey) {
                                            e.preventDefault();
                                            focusFirstColumnNameField();
                                            return;
                                        }
                                        if (e.key !== "Enter") return;
                                        if (e.shiftKey) return;
                                        if (e.nativeEvent.isComposing) return;
                                        e.preventDefault();
                                        focusFirstColumnNameField();
                                    }}
                                />
                            </div>
                            <input
                                type="color"
                                aria-label={t("dialog.tableColor")}
                                value={draft.color ?? "#e8f0ff"}
                                onChange={(e) => {
                                    markUserEdited();
                                    setDraft({
                                        ...draft,
                                        color: e.target.value,
                                    });
                                }}
                                style={{
                                    width: 42,
                                    height: 36,
                                    border: "1px solid var(--erd-border)",
                                    borderRadius: 8,
                                    padding: 2,
                                }}
                            />
                            <button
                                type="button"
                                className="erd-dialog-icon-btn"
                                aria-label={t("dialog.tableColor.clear")}
                                title={t("dialog.tableColor.clear")}
                                onClick={() => {
                                    markUserEdited();
                                    setDraft({ ...draft, color: undefined });
                                }}
                            >
                                <Eraser size={16} />
                            </button>
                        </div>
                    </div>
                    <div
                        className={`${gridClass} erd-dialog-col-grid--header erd-dialog-col-grid--header--tight`}
                    >
                        <div className="erd-dialog-col-head-name">
                            <span
                                className="erd-dialog-col-head-icon-slot"
                                aria-hidden
                            />
                            <span className="erd-dialog-col-head-text">
                                {t("dialog.column.name")}
                            </span>
                        </div>
                        <span className="erd-dialog-col-head-text">
                            {t("dialog.column.type")}
                        </span>
                        {dialogDisplayMode === "physical" ? (
                            <span className="erd-dialog-col-head-text">
                                {t("dialog.column.defaultValue")}
                            </span>
                        ) : null}
                        <span
                            className="erd-dialog-col-head-tight"
                            title={t("dialog.column.pkTitle")}
                        >
                            {t("dialog.column.pk")}
                        </span>
                        <span
                            className="erd-dialog-col-head-tight"
                            title={t("dialog.column.nullTitle")}
                        >
                            {t("dialog.column.nullShort")}
                        </span>
                        <span
                            className="erd-dialog-col-head-spacer"
                            aria-hidden="true"
                        />
                        <span
                            className="erd-dialog-col-head-spacer"
                            aria-hidden="true"
                        />
                        <span
                            className="erd-dialog-col-head-spacer"
                            aria-hidden="true"
                        />
                        <span className="erd-dialog-col-head-text">
                            {t("dialog.column.description")}
                        </span>
                    </div>
                    <div
                        className="erd-dialog-column-list"
                        onDragOver={(e) => {
                            if (draggingColumnIndex == null) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                        }}
                    >
                        {draft.columns.map((col, index) => (
                        (() => {
                            const columnNameEmpty =
                                getColumnName(index).trim().length === 0;
                            const nextColumn = draft.columns[index + 1];
                            const downBlockedByTrailingBlank =
                                nextColumn != null &&
                                columnNamesBlank(nextColumn);
                            return (
                            <div
                                key={col.id}
                                className="erd-dialog-column-row"
                                onDragOver={(e) => {
                                    if (draggingColumnIndex == null) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                }}
                                onDrop={(e) => {
                                    if (draggingColumnIndex == null) return;
                                    e.preventDefault();
                                    moveColumnTo(draggingColumnIndex, index);
                                    setDraggingColumnIndex(null);
                                }}
                            >
                                <div className={gridClass}>
                                    <div className="erd-dialog-column-name-cell">
                                        <span
                                            className="erd-dialog-column-key-icon"
                                            aria-hidden
                                            draggable={!columnNameEmpty}
                                            title={t("dialog.column.moveUp")}
                                            onDragStart={(e) => {
                                                if (columnNameEmpty) return;
                                                e.dataTransfer.effectAllowed =
                                                    "move";
                                                e.dataTransfer.setData(
                                                    "text/plain",
                                                    col.id,
                                                );
                                                setDraggingColumnIndex(index);
                                            }}
                                            onDragEnd={() =>
                                                setDraggingColumnIndex(null)
                                            }
                                        >
                                            <span className="erd-dialog-column-drag-grip">
                                                <GripVertical
                                                    size={10}
                                                    strokeWidth={2}
                                                />
                                            </span>
                                            <span
                                                className={
                                                    col.isPrimaryKey ||
                                                    col.isForeignKey
                                                        ? ""
                                                        : "erd-dialog-column-icon--empty"
                                                }
                                            >
                                                {col.isPrimaryKey ? (
                                                    <KeyRound
                                                        size={11}
                                                        strokeWidth={2.2}
                                                    />
                                                ) : col.isForeignKey ? (
                                                    <Link2
                                                        size={11}
                                                        strokeWidth={2.2}
                                                    />
                                                ) : null}
                                            </span>
                                        </span>
                                        <input
                                            className="erd-input"
                                            ref={(el) =>
                                                registerColumnField(
                                                    index,
                                                    "name",
                                                    el,
                                                )
                                            }
                                            value={getColumnName(index)}
                                            placeholder={
                                                dialogDisplayMode === "logical"
                                                    ? (col.physicalName?.trim() ??
                                                      "")
                                                    : (col.logicalName?.trim() ??
                                                      "")
                                            }
                                            onChange={(e) =>
                                                setColumnName(
                                                    index,
                                                    e.target.value,
                                                )
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key !== "Enter")
                                                    return;
                                                if (e.shiftKey) return;
                                                if (e.nativeEvent.isComposing)
                                                    return;
                                                e.preventDefault();
                                                focusNextColumnField(
                                                    index,
                                                    "name",
                                                    draft.columns.length,
                                                );
                                            }}
                                            style={{
                                                fontStyle: col.isForeignKey
                                                    ? "italic"
                                                    : "normal",
                                                minWidth: 0,
                                            }}
                                        />
                                    </div>
                                {dialogDisplayMode === "logical" ? (
                                    <select
                                        className="erd-select"
                                        ref={(el) =>
                                            registerColumnField(
                                                index,
                                                "type",
                                                el,
                                            )
                                        }
                                        value={col.logicalType}
                                        onChange={(e) => {
                                            const lt = e.target
                                                .value as LogicalDataType;
                                            updateColumn(index, {
                                                logicalType: lt,
                                                physicalType:
                                                    defaultPhysicalType(
                                                        dialect,
                                                        lt,
                                                        resolvedCoreOptions,
                                                    ),
                                            });
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key !== "Enter") return;
                                            if (e.shiftKey) return;
                                            if (e.nativeEvent.isComposing)
                                                return;
                                            e.preventDefault();
                                            focusNextColumnField(
                                                index,
                                                "type",
                                                draft.columns.length,
                                            );
                                        }}
                                    >
                                        {logicalTypes.map((t) => (
                                            <option key={t} value={t}>
                                                {t}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className="erd-input"
                                        ref={(el) =>
                                            registerColumnField(
                                                index,
                                                "type",
                                                el,
                                            )
                                        }
                                        value={col.physicalType}
                                        onChange={(e) =>
                                            updateColumn(index, {
                                                ...patchColumnOnPhysicalTypeUserEdit(
                                                    dialect,
                                                    e.target.value,
                                                    resolvedCoreOptions,
                                                ),
                                            })
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key !== "Enter") return;
                                            if (e.shiftKey) return;
                                            if (e.nativeEvent.isComposing)
                                                return;
                                            e.preventDefault();
                                            focusNextColumnField(
                                                index,
                                                "type",
                                                draft.columns.length,
                                            );
                                        }}
                                        style={{ minWidth: 0 }}
                                    />
                                )}
                                {dialogDisplayMode === "physical" ? (
                                    <input
                                        className="erd-input"
                                        aria-label={t(
                                            "dialog.column.defaultValue",
                                        )}
                                        value={col.defaultValue ?? ""}
                                        placeholder={t(
                                            "dialog.column.defaultValuePlaceholder",
                                        )}
                                        onChange={(e) =>
                                            updateColumn(index, {
                                                defaultValue: e.target.value,
                                            })
                                        }
                                        style={{ minWidth: 0 }}
                                    />
                                ) : null}
                                <label
                                    style={{
                                        display: "flex",
                                        justifyContent: "center",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={Boolean(col.isPrimaryKey)}
                                        onChange={(e) =>
                                            updateColumn(index, {
                                                isPrimaryKey: e.target.checked,
                                                nullable: e.target.checked
                                                    ? false
                                                    : col.nullable,
                                            })
                                        }
                                    />
                                </label>
                                <label
                                    style={{
                                        display: "flex",
                                        justifyContent: "center",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={col.nullable}
                                        disabled={Boolean(col.isPrimaryKey)}
                                        onChange={(e) =>
                                            updateColumn(index, {
                                                nullable: e.target.checked,
                                            })
                                        }
                                    />
                                </label>
                                <div className="erd-dialog-column-actions">
                                    <button
                                        type="button"
                                        className="erd-dialog-icon-btn erd-dialog-icon-btn--row"
                                        aria-label={t("dialog.column.moveUp")}
                                        disabled={index === 0 || columnNameEmpty}
                                        onClick={() => {
                                            if (columnNameEmpty) return;
                                            moveColumn(index, -1);
                                        }}
                                    >
                                        <ChevronUp size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        className="erd-dialog-icon-btn erd-dialog-icon-btn--row"
                                        aria-label={t("dialog.column.moveDown")}
                                        disabled={
                                            index === draft.columns.length - 1 ||
                                            columnNameEmpty ||
                                            downBlockedByTrailingBlank
                                        }
                                        onClick={() => {
                                            if (columnNameEmpty) return;
                                            if (downBlockedByTrailingBlank)
                                                return;
                                            moveColumn(index, 1);
                                        }}
                                    >
                                        <ChevronDown size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        className="erd-dialog-icon-btn erd-dialog-icon-btn--row erd-dialog-icon-btn--danger"
                                        aria-label={t("dialog.column.delete")}
                                        disabled={draft.columns.length <= 1}
                                        onClick={() => requestRemoveColumn(index)}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <input
                                    type="color"
                                    className="erd-dialog-column-color"
                                    aria-label={t("dialog.column.color")}
                                    value={col.color ?? "#f1f5f9"}
                                    onChange={(e) =>
                                        updateColumn(index, {
                                            color: e.target.value,
                                        })
                                    }
                                />
                                <button
                                    type="button"
                                    className="erd-dialog-icon-btn erd-dialog-icon-btn--row"
                                    aria-label={t("dialog.column.color.clear")}
                                    title={t("dialog.column.color.clear")}
                                    onClick={() =>
                                        updateColumn(index, {
                                            color: undefined,
                                        })
                                    }
                                >
                                    <Eraser size={12} />
                                </button>
                                <input
                                    className="erd-input"
                                    ref={(el) =>
                                        registerColumnField(
                                            index,
                                            "description",
                                            el,
                                        )
                                    }
                                    value={col.description ?? ""}
                                    onChange={(e) =>
                                        updateColumn(index, {
                                            description: e.target.value,
                                        })
                                    }
                                    placeholder={t("dialog.column.description")}
                                    onKeyDown={(e) => {
                                        if (e.key !== "Enter") return;
                                        if (e.shiftKey) return;
                                        if (e.nativeEvent.isComposing) return;
                                        e.preventDefault();
                                        focusNextColumnField(
                                            index,
                                            "description",
                                            draft.columns.length,
                                        );
                                    }}
                                    style={{ minWidth: 0 }}
                                />
                            </div>
                        </div>
                            );
                        })()
                    ))}
                    </div>
                </div>
                <div
                    className="erd-dialog-footer"
                    style={{
                        flexDirection: "column",
                        alignItems: "stretch",
                        gap: 8,
                    }}
                >
                    {saveError ? (
                        <div
                            role="alert"
                            style={{
                                color: "#b91c1c",
                                fontSize: 13,
                            }}
                        >
                            {saveError}
                        </div>
                    ) : null}
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "flex-end",
                        }}
                    >
                        <button
                            type="button"
                            className="erd-btn erd-btn--ghost"
                            onClick={requestClose}
                        >
                            {t("dialog.cancel")}
                        </button>
                        <button
                            type="button"
                            className="erd-btn erd-btn--primary"
                            onClick={handleAttemptSave}
                        >
                            {t("dialog.save")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        {confirmDialog}
        </>
    );
}
