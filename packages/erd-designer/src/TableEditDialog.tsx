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
    KeyRound,
    Link2,
    Trash2,
    X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import type { CanvasDisplayMode } from "./ERDDesigner";
import { createId } from "./id";
import { useErdTranslator } from "./i18n/I18nContext";
import type { I18nKey, I18nVars } from "./i18n/types";

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
}

function cloneTable(t: TableModel): TableModel {
    return {
        ...t,
        columns: t.columns.map((c) => ({ ...c })),
    };
}

function columnNamesBlank(col: ColumnModel): boolean {
    return !col.logicalName?.trim() && !col.physicalName?.trim();
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

function normalizeTableForSave(
    draft: TableModel,
    dialect: RdbmsDialect,
    tr: (key: I18nKey, vars?: I18nVars) => string,
    coreOptions?: CoreDbMetaOptions,
): TableModel {
    const filtered = draft.columns.filter((c) => !columnNamesBlank(c));
    const columns =
        filtered.length > 0
            ? filtered
            : [
                  createColumn(
                      dialect,
                      {
                          id: createId("col"),
                          logicalName: tr("designer.defaultColumnName"),
                          logicalType: "TEXT",
                      },
                      coreOptions,
                  ),
              ];
    return { ...draft, columns };
}

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
}: TableEditDialogProps) {
    const { t } = useErdTranslator({ locale, translations, t: tProp });
    const [draft, setDraft] = useState<TableModel | null>(null);
    const [dialogDisplayMode, setDialogDisplayMode] =
        useState<CanvasDisplayMode>(displayMode);

    useEffect(() => {
        if (open && table) {
            setDraft(
                ensureTrailingBlankColumn(
                    cloneTable(table),
                    dialect,
                    coreOptions,
                ),
            );
        }
    }, [coreOptions, open, table, dialect]);

    useEffect(() => {
        if (!open) return;
        setDialogDisplayMode(displayMode);
    }, [displayMode, open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    const title = useMemo(() => {
        if (!draft) return t("dialog.tableEdit.fallbackTitle");
        const name =
            dialogDisplayMode === "logical"
                ? draft.logicalName
                : draft.physicalName;
        return t("dialog.tableEdit.titleWithName", { name });
    }, [dialogDisplayMode, draft, t]);

    if (!open || !table || !draft) return null;

    const updateColumn = (index: number, patch: Partial<ColumnModel>) => {
        setDraft((d) => {
            if (!d) return d;
            const cols = [...d.columns];
            cols[index] = { ...cols[index], ...patch };
            return ensureTrailingBlankColumn(
                { ...d, columns: cols },
                dialect,
                coreOptions,
            );
        });
    };

    const moveColumn = (index: number, dir: -1 | 1) => {
        setDraft((d) => {
            if (!d) return d;
            const j = index + dir;
            if (j < 0 || j >= d.columns.length) return d;
            const cols = [...d.columns];
            [cols[index], cols[j]] = [cols[j], cols[index]];
            return ensureTrailingBlankColumn(
                { ...d, columns: cols },
                dialect,
                coreOptions,
            );
        });
    };

    const removeColumn = (index: number) => {
        setDraft((d) => {
            if (!d || d.columns.length <= 1) return d;
            return ensureTrailingBlankColumn(
                { ...d, columns: d.columns.filter((_, i) => i !== index) },
                dialect,
                coreOptions,
            );
        });
    };

    const nameCaption = t("dialog.tableName");
    const descriptionCaption = t("dialog.tableDescription");
    const getColumnName = (index: number) =>
        dialogDisplayMode === "logical"
            ? draft.columns[index].logicalName
            : draft.columns[index].physicalName;

    const setColumnName = (index: number, value: string) => {
        if (dialogDisplayMode === "logical") {
            const col = draft.columns[index];
            const patch: Partial<ColumnModel> = { logicalName: value };
            if (col.physicalName === col.logicalName) {
                patch.physicalName = value;
            }
            updateColumn(index, patch);
            return;
        }
        updateColumn(index, { physicalName: value });
    };

    const gridClass =
        dialogDisplayMode === "physical"
            ? "erd-dialog-col-grid erd-dialog-col-grid--physical"
            : "erd-dialog-col-grid erd-dialog-col-grid--logical";
    const supportsSchema = dialectSupportsSchema(dialect, coreOptions);
    const logicalTypes =
        resolveDialectMetas(coreOptions)
            .find((m) => m.id === dialect)
            ?.logicalTypes.map((lt) => lt.id) ?? LOGICAL_DATA_TYPES;

    return (
        <div className="erd-dialog-backdrop" role="presentation">
            <div
                className="erd-dialog"
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
                            onClick={() => setDialogDisplayMode("logical")}
                        >
                            {t("toolbar.mode.logical")}
                        </button>
                        <button
                            type="button"
                            className={`erd-dialog-mode-btn${dialogDisplayMode === "physical" ? " erd-dialog-mode-btn--active" : ""}`}
                            onClick={() => setDialogDisplayMode("physical")}
                        >
                            {t("toolbar.mode.physical")}
                        </button>
                        <button
                            type="button"
                            className="erd-node-header-btn"
                            aria-label={t("dialog.close")}
                            onClick={onClose}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
                <div className="erd-dialog-body">
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
                                        onChange={(e) =>
                                            setDraft({
                                                ...draft,
                                                schemaName: e.target.value,
                                            })
                                        }
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
                                    onChange={(e) => {
                                        const nextName = e.target.value;
                                        if (dialogDisplayMode === "logical") {
                                            const next = {
                                                ...draft,
                                                logicalName: nextName,
                                            };
                                            if (
                                                draft.physicalName ===
                                                draft.logicalName
                                            ) {
                                                next.physicalName = nextName;
                                            }
                                            setDraft(next);
                                        } else {
                                            setDraft({
                                                ...draft,
                                                physicalName: nextName,
                                            });
                                        }
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
                                    className="erd-input"
                                    value={draft.description ?? ""}
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            description: e.target.value,
                                        })
                                    }
                                    placeholder={descriptionCaption}
                                />
                            </div>
                            <input
                                type="color"
                                aria-label={t("dialog.tableColor")}
                                value={draft.color ?? "#e8f0ff"}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        color: e.target.value,
                                    })
                                }
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
                                onClick={() =>
                                    setDraft({ ...draft, color: undefined })
                                }
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
                                {t("dialog.column.default")}
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
                    <div className="erd-dialog-column-list">
                        {draft.columns.map((col, index) => (
                            <div key={col.id} className="erd-dialog-column-row">
                                <div className={gridClass}>
                                    <div className="erd-dialog-column-name-cell">
                                        <span
                                            className={`erd-dialog-column-key-icon${col.isPrimaryKey || col.isForeignKey ? "" : " erd-dialog-column-icon--empty"}`}
                                            aria-hidden
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
                                        <input
                                            className="erd-input"
                                            value={getColumnName(index)}
                                            onChange={(e) =>
                                                setColumnName(
                                                    index,
                                                    e.target.value,
                                                )
                                            }
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
                                                        coreOptions,
                                                    ),
                                            });
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
                                        value={col.physicalType}
                                        onChange={(e) =>
                                            updateColumn(index, {
                                                physicalType:
                                                    e.target.value.toUpperCase(),
                                            })
                                        }
                                        style={{ minWidth: 0 }}
                                    />
                                )}
                                {dialogDisplayMode === "physical" ? (
                                    <input
                                        className="erd-input"
                                        value={col.defaultValue ?? ""}
                                        placeholder="DEFAULT"
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
                                        disabled={index === 0}
                                        onClick={() => moveColumn(index, -1)}
                                    >
                                        <ChevronUp size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        className="erd-dialog-icon-btn erd-dialog-icon-btn--row"
                                        aria-label={t("dialog.column.moveDown")}
                                        disabled={
                                            index === draft.columns.length - 1
                                        }
                                        onClick={() => moveColumn(index, 1)}
                                    >
                                        <ChevronDown size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        className="erd-dialog-icon-btn erd-dialog-icon-btn--row erd-dialog-icon-btn--danger"
                                        aria-label={t("dialog.column.delete")}
                                        disabled={draft.columns.length <= 1}
                                        onClick={() => removeColumn(index)}
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
                                    value={col.description ?? ""}
                                    onChange={(e) =>
                                        updateColumn(index, {
                                            description: e.target.value,
                                        })
                                    }
                                    placeholder={t("dialog.column.description")}
                                    style={{ minWidth: 0 }}
                                />
                            </div>
                        </div>
                    ))}
                    </div>
                </div>
                <div className="erd-dialog-footer">
                    <button
                        type="button"
                        className="erd-btn erd-btn--ghost"
                        onClick={onClose}
                    >
                        {t("dialog.cancel")}
                    </button>
                    <button
                        type="button"
                        className="erd-btn erd-btn--primary"
                        onClick={() => {
                            onSave(
                                normalizeTableForSave(
                                    draft,
                                    dialect,
                                    t,
                                    coreOptions,
                                ),
                            );
                            onClose();
                        }}
                    >
                        {t("dialog.save")}
                    </button>
                </div>
            </div>
        </div>
    );
}
