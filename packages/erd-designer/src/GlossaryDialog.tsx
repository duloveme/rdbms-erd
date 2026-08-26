"use client";

import type { GlossaryEntry } from "@rdbms-erd/core";
import { createId } from "@rdbms-erd/core";
import { Plus, Trash2, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import type { GlossaryMatchKey } from "./glossary";
import { useErdTranslator } from "./i18n/I18nContext";
import type { I18nKey, I18nVars } from "./i18n/types";

export interface GlossaryDialogProps {
    open: boolean;
    entries: readonly GlossaryEntry[];
    onClose: () => void;
    onChange: (entries: GlossaryEntry[]) => void;
    onApplySelected: (entryIds: string[]) => void;
    /** Match-key side shown as the first name column. Default `logical`. */
    glossaryMatchKey?: GlossaryMatchKey;
    locale?: string;
    translations?: Partial<Record<I18nKey, string>>;
    t?: (key: I18nKey, vars?: I18nVars) => string;
}

export function GlossaryDialog({
    open,
    entries,
    onClose,
    onChange,
    onApplySelected,
    glossaryMatchKey = "logical",
    locale,
    translations,
    t: tProp,
}: GlossaryDialogProps) {
    const { t } = useErdTranslator({ locale, translations, t: tProp });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(),
    );

    const allSelected = useMemo(
        () => entries.length > 0 && entries.every((e) => selectedIds.has(e.id)),
        [entries, selectedIds],
    );

    if (!open) return null;

    const toggleAll = () => {
        if (allSelected) {
            setSelectedIds(new Set());
            return;
        }
        setSelectedIds(new Set(entries.map((e) => e.id)));
    };

    const toggleOne = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const updateEntry = (
        id: string,
        patch: Partial<Pick<GlossaryEntry, "logicalName" | "physicalName">>,
    ) => {
        onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    };

    const addRow = () => {
        const id = createId("gloss");
        onChange([...entries, { id, logicalName: "", physicalName: "" }]);
        setSelectedIds((prev) => new Set(prev).add(id));
    };

    const deleteSelected = () => {
        if (selectedIds.size === 0) return;
        onChange(entries.filter((e) => !selectedIds.has(e.id)));
        setSelectedIds(new Set());
    };

    const applySelected = () => {
        const ids = [...selectedIds].filter((id) => {
            const e = entries.find((x) => x.id === id);
            return e && e.logicalName.trim() && e.physicalName.trim();
        });
        if (ids.length === 0) return;
        onApplySelected(ids);
    };

    const physicalFirst = glossaryMatchKey === "physical";
    const firstHeaderKey = physicalFirst
        ? "dialog.glossary.physicalName"
        : "dialog.glossary.logicalName";
    const secondHeaderKey = physicalFirst
        ? "dialog.glossary.logicalName"
        : "dialog.glossary.physicalName";

    return (
        <div className="erd-dialog-backdrop" role="presentation">
            <div
                className="erd-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="erd-glossary-dialog-title"
                style={{
                    width: "min(720px, 100%)",
                    maxHeight: "min(80vh, 640px)",
                    display: "flex",
                    flexDirection: "column",
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="erd-dialog-header">
                    <span id="erd-glossary-dialog-title">
                        {t("dialog.glossary.title")}
                    </span>
                    <button
                        type="button"
                        className="erd-dialog-icon-btn"
                        aria-label={t("dialog.close")}
                        onClick={onClose}
                    >
                        <X size={16} />
                    </button>
                </div>
                <div
                    className="erd-dialog-body"
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        minHeight: 0,
                        flex: 1,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                        }}
                    >
                        <button
                            type="button"
                            className="erd-btn erd-btn--ghost"
                            onClick={addRow}
                        >
                            <Plus size={14} />
                            {t("dialog.glossary.add")}
                        </button>
                        <button
                            type="button"
                            className="erd-btn erd-btn--ghost"
                            disabled={selectedIds.size === 0}
                            onClick={deleteSelected}
                        >
                            <Trash2 size={14} />
                            {t("dialog.glossary.deleteSelected")}
                        </button>
                        <button
                            type="button"
                            className="erd-btn erd-btn--primary"
                            disabled={selectedIds.size === 0}
                            onClick={applySelected}
                        >
                            {t("dialog.glossary.applySelected")}
                        </button>
                    </div>
                    <div
                        style={{
                            border: "1px solid var(--erd-border)",
                            borderRadius: 8,
                            overflow: "auto",
                            flex: 1,
                            minHeight: 180,
                        }}
                    >
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "28px 1fr 1fr",
                                gap: 8,
                                padding: "8px 10px",
                                borderBottom: "1px solid var(--erd-border)",
                                background: "var(--erd-surface-muted)",
                                fontSize: 12,
                                fontWeight: 600,
                                position: "sticky",
                                top: 0,
                                zIndex: 1,
                            }}
                        >
                            <label title={t("dialog.glossary.selectAll")}>
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={toggleAll}
                                    aria-label={t("dialog.glossary.selectAll")}
                                />
                            </label>
                            <span>{t(firstHeaderKey)}</span>
                            <span>{t(secondHeaderKey)}</span>
                        </div>
                        {entries.length === 0 ? (
                            <p
                                style={{
                                    margin: 16,
                                    fontSize: 13,
                                    color: "var(--erd-text-muted)",
                                }}
                            >
                                {t("dialog.glossary.empty")}
                            </p>
                        ) : (
                            entries.map((entry) => (
                                <div
                                    key={entry.id}
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "28px 1fr 1fr",
                                        gap: 8,
                                        padding: "6px 10px",
                                        borderBottom:
                                            "1px solid var(--erd-border)",
                                        alignItems: "center",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(entry.id)}
                                        onChange={() => toggleOne(entry.id)}
                                    />
                                    {physicalFirst ? (
                                        <>
                                            <input
                                                className="erd-input"
                                                value={entry.physicalName}
                                                onChange={(e) =>
                                                    updateEntry(entry.id, {
                                                        physicalName:
                                                            e.target.value,
                                                    })
                                                }
                                                placeholder={t(
                                                    "dialog.glossary.physicalName",
                                                )}
                                            />
                                            <input
                                                className="erd-input"
                                                value={entry.logicalName}
                                                onChange={(e) =>
                                                    updateEntry(entry.id, {
                                                        logicalName:
                                                            e.target.value,
                                                    })
                                                }
                                                placeholder={t(
                                                    "dialog.glossary.logicalName",
                                                )}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <input
                                                className="erd-input"
                                                value={entry.logicalName}
                                                onChange={(e) =>
                                                    updateEntry(entry.id, {
                                                        logicalName:
                                                            e.target.value,
                                                    })
                                                }
                                                placeholder={t(
                                                    "dialog.glossary.logicalName",
                                                )}
                                            />
                                            <input
                                                className="erd-input"
                                                value={entry.physicalName}
                                                onChange={(e) =>
                                                    updateEntry(entry.id, {
                                                        physicalName:
                                                            e.target.value,
                                                    })
                                                }
                                                placeholder={t(
                                                    "dialog.glossary.physicalName",
                                                )}
                                            />
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <div className="erd-dialog-footer">
                    <button
                        type="button"
                        className="erd-btn erd-btn--primary"
                        onClick={onClose}
                    >
                        {t("dialog.close")}
                    </button>
                </div>
            </div>
        </div>
    );
}
