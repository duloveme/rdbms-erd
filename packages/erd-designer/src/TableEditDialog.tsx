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
    Link2,
    Trash2,
    Unlink,
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

    const title = useMemo(() => {
        if (!draft) return t("dialog.tableEdit.fallbackTitle");
        const name =
            displayMode === "logical" ? draft.logicalName : draft.physicalName;
        return t("dialog.tableEdit.titleWithName", { name });
    }, [displayMode, draft, t]);

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
    const getColumnName = (index: number) =>
        displayMode === "logical"
            ? draft.columns[index].logicalName
            : draft.columns[index].physicalName;

    const setColumnName = (index: number, value: string) => {
        if (displayMode === "logical") {
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
        displayMode === "physical"
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
                    <button
                        type="button"
                        className="erd-node-header-btn"
                        aria-label={t("dialog.close")}
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="erd-dialog-body">
                    <div className="erd-field">
                        <label htmlFor="erd-t-name">{nameCaption}</label>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr auto auto",
                                gap: 8,
                                alignItems: "center",
                            }}
                        >
                            <input
                                id="erd-t-name"
                                className="erd-input"
                                value={
                                    displayMode === "logical"
                                        ? draft.logicalName
                                        : draft.physicalName
                                }
                                onChange={(e) => {
                                    const nextName = e.target.value;
                                    if (displayMode === "logical") {
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
                    {displayMode === "physical" && supportsSchema ? (
                        <div className="erd-field">
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
                                placeholder="public"
                            />
                        </div>
                    ) : null}
                    <div className={`${gridClass} erd-dialog-col-grid--header`}>
                        <span className="erd-dialog-col-head-text">
                            {t("dialog.column.name")}
                        </span>
                        <span className="erd-dialog-col-head-text">
                            {t("dialog.column.type")}
                        </span>
                        {displayMode === "physical" ? (
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
                        <span
                            className="erd-dialog-col-head-spacer"
                            aria-hidden="true"
                        />
                    </div>
                    {draft.columns.map((col, index) => (
                        <div
                            key={col.id}
                            style={{
                                border: "1px solid var(--erd-border)",
                                borderRadius:
                                    index === 0
                                        ? "10px 10px 0 0"
                                        : index === draft.columns.length - 1
                                          ? "0 0 10px 10px"
                                          : 0,
                                padding: "6px 8px",
                                marginBottom: 0,
                                marginTop: index === 0 ? 0 : -1,
                                background: "#fafafa",
                            }}
                        >
                            <div className={gridClass}>
                                <input
                                    className="erd-input"
                                    value={getColumnName(index)}
                                    onChange={(e) =>
                                        setColumnName(index, e.target.value)
                                    }
                                    style={{
                                        fontStyle: col.isForeignKey
                                            ? "italic"
                                            : "normal",
                                        minWidth: 0,
                                    }}
                                />
                                {displayMode === "logical" ? (
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
                                {displayMode === "physical" ? (
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
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 2,
                                        justifyContent: "center",
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="erd-toolbar-btn"
                                        style={{ minWidth: 28, padding: 0 }}
                                        aria-label={t("dialog.column.moveUp")}
                                        disabled={index === 0}
                                        onClick={() => moveColumn(index, -1)}
                                    >
                                        <ChevronUp size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        className="erd-toolbar-btn"
                                        style={{ minWidth: 28, padding: 0 }}
                                        aria-label={t("dialog.column.moveDown")}
                                        disabled={
                                            index === draft.columns.length - 1
                                        }
                                        onClick={() => moveColumn(index, 1)}
                                    >
                                        <ChevronDown size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        className="erd-toolbar-btn"
                                        style={{
                                            minWidth: 28,
                                            padding: 0,
                                            color: "var(--erd-danger)",
                                        }}
                                        aria-label={t("dialog.column.delete")}
                                        disabled={draft.columns.length <= 1}
                                        onClick={() => removeColumn(index)}
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    className={`erd-dialog-icon-btn ${col.isForeignKey && col.showFkRelationLine !== false ? "erd-dialog-icon-btn--on" : ""}`}
                                    style={{
                                        visibility: col.isForeignKey
                                            ? "visible"
                                            : "hidden",
                                    }}
                                    disabled={!col.isForeignKey}
                                    title={
                                        col.showFkRelationLine !== false
                                            ? t("dialog.column.fkLineOn")
                                            : t("dialog.column.fkLineOff")
                                    }
                                    aria-label={
                                        col.showFkRelationLine !== false
                                            ? t("dialog.column.fkLineOn")
                                            : t("dialog.column.fkLineOff")
                                    }
                                    aria-pressed={
                                        col.isForeignKey
                                            ? col.showFkRelationLine !== false
                                            : undefined
                                    }
                                    onClick={() => {
                                        if (!col.isForeignKey) return;
                                        updateColumn(index, {
                                            showFkRelationLine: !(
                                                col.showFkRelationLine !== false
                                            ),
                                        });
                                    }}
                                >
                                    {col.showFkRelationLine !== false ? (
                                        <Link2 size={16} />
                                    ) : (
                                        <Unlink size={16} />
                                    )}
                                </button>
                                <input
                                    type="color"
                                    aria-label={t("dialog.column.color")}
                                    value={col.color ?? "#f1f5f9"}
                                    onChange={(e) =>
                                        updateColumn(index, {
                                            color: e.target.value,
                                        })
                                    }
                                    style={{
                                        width: 28,
                                        height: 28,
                                        border: "1px solid var(--erd-border)",
                                        borderRadius: 6,
                                        padding: 0,
                                        flexShrink: 0,
                                    }}
                                />
                                <button
                                    type="button"
                                    className="erd-dialog-icon-btn"
                                    aria-label={t("dialog.column.color.clear")}
                                    title={t("dialog.column.color.clear")}
                                    onClick={() =>
                                        updateColumn(index, {
                                            color: undefined,
                                        })
                                    }
                                >
                                    <Eraser size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
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
