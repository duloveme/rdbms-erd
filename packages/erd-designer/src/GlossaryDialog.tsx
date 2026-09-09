"use client";

import type { GlossaryEntry } from "@rdbms-erd/core";
import { createId } from "@rdbms-erd/core";
import { FileJson, FolderOpen, Plus, Trash2, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { downloadJsonFile, sanitizeFileBase } from "./fileDownload";
import type { GlossaryMatchKey } from "./glossary";
import {
    glossaryEntriesEqual,
    mergeGlossaryEntries,
    parseGlossaryJson,
} from "./glossary";
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
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const [importPrompt, setImportPrompt] = useState<
        | { kind: "choose"; entries: GlossaryEntry[] }
        | { kind: "failed"; message: string }
        | null
    >(null);
    const [draft, setDraft] = useState<GlossaryEntry[]>([]);
    const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
    const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
    const rowInputRefs = useRef(new Map<string, HTMLInputElement>());
    const wasOpenRef = useRef(false);

    // 닫힘 -> 열림 전환에서만 초기화한다. `entries`가 갱신될 때마다 초기화하면
    // 편집 중인 draft가 지워진다.
    useEffect(() => {
        if (open && !wasOpenRef.current) {
            setDraft(entries.map((e) => ({ ...e })));
            setSelectedIds(new Set());
            setCloseConfirmOpen(false);
            setImportPrompt(null);
            setPendingFocusId(null);
        }
        wasOpenRef.current = open;
    }, [open, entries]);

    useEffect(() => {
        if (!pendingFocusId) return;
        const el = rowInputRefs.current.get(pendingFocusId);
        if (!el) return;
        el.focus();
        el.scrollIntoView({ block: "nearest" });
        setPendingFocusId(null);
    }, [pendingFocusId, draft]);

    const allSelected = useMemo(
        () => draft.length > 0 && draft.every((e) => selectedIds.has(e.id)),
        [draft, selectedIds],
    );

    const dirty = !glossaryEntriesEqual(draft, entries);

    if (!open) return null;

    const toggleAll = () => {
        if (allSelected) {
            setSelectedIds(new Set());
            return;
        }
        setSelectedIds(new Set(draft.map((e) => e.id)));
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
        setDraft((prev) =>
            prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        );
    };

    const addRow = () => {
        const id = createId("gloss");
        setDraft((prev) => [...prev, { id, logicalName: "", physicalName: "" }]);
        setSelectedIds((prev) => new Set(prev).add(id));
        setPendingFocusId(id);
    };

    const deleteSelected = () => {
        if (selectedIds.size === 0) return;
        setDraft((prev) => prev.filter((e) => !selectedIds.has(e.id)));
        setSelectedIds(new Set());
    };

    const commitDraft = () => {
        onChange(draft);
    };

    const applySelected = () => {
        const ids = [...selectedIds].filter((id) => {
            const e = draft.find((x) => x.id === id);
            return e && e.logicalName.trim() && e.physicalName.trim();
        });
        if (ids.length === 0) return;
        commitDraft();
        onApplySelected(ids);
    };

    const requestClose = () => {
        if (dirty) {
            setCloseConfirmOpen(true);
            return;
        }
        onClose();
    };

    const exportJson = () => {
        downloadJsonFile(
            JSON.stringify(draft, null, 2),
            sanitizeFileBase(undefined, "glossary"),
        );
    };

    const handleImportFile = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        let imported: GlossaryEntry[];
        try {
            imported = parseGlossaryJson(await file.text());
        } catch (err) {
            setImportPrompt({
                kind: "failed",
                message: err instanceof Error ? err.message : String(err),
            });
            return;
        }
        if (draft.length === 0) {
            setDraft(imported);
            return;
        }
        setImportPrompt({ kind: "choose", entries: imported });
    };

    const applyImport = (mode: "replace" | "merge") => {
        if (importPrompt?.kind !== "choose") return;
        setDraft((prev) =>
            mode === "replace"
                ? importPrompt.entries
                : mergeGlossaryEntries(
                      prev,
                      importPrompt.entries,
                      glossaryMatchKey,
                  ),
        );
        setSelectedIds(new Set());
        setImportPrompt(null);
    };

    const registerRowInput = (id: string, el: HTMLInputElement | null) => {
        if (el) rowInputRefs.current.set(id, el);
        else rowInputRefs.current.delete(id);
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
                        onClick={requestClose}
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
                        {draft.length === 0 ? (
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
                            draft.map((entry) => (
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
                                                ref={(el) =>
                                                    registerRowInput(
                                                        entry.id,
                                                        el,
                                                    )
                                                }
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
                                                ref={(el) =>
                                                    registerRowInput(
                                                        entry.id,
                                                        el,
                                                    )
                                                }
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
                        className="erd-dialog-icon-btn"
                        title={t("dialog.glossary.exportJson")}
                        aria-label={t("dialog.glossary.exportJson")}
                        onClick={exportJson}
                        disabled={draft.length === 0}
                    >
                        <FileJson size={16} />
                    </button>
                    <button
                        type="button"
                        className="erd-dialog-icon-btn"
                        style={{ marginRight: "auto" }}
                        title={t("dialog.glossary.importJson")}
                        aria-label={t("dialog.glossary.importJson")}
                        onClick={() => importInputRef.current?.click()}
                    >
                        <FolderOpen size={16} />
                    </button>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => void handleImportFile(e)}
                        style={{ display: "none" }}
                    />
                    <button
                        type="button"
                        className="erd-btn erd-btn--primary"
                        disabled={!dirty}
                        onClick={commitDraft}
                    >
                        {t("dialog.save")}
                    </button>
                    <button
                        type="button"
                        className="erd-btn erd-btn--ghost"
                        onClick={requestClose}
                    >
                        {t("dialog.close")}
                    </button>
                </div>
            </div>
            {importPrompt ? (
                <div
                    className="erd-dialog-backdrop erd-dialog-backdrop--nested"
                    role="presentation"
                >
                    <div
                        className="erd-dialog"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="erd-glossary-import-title"
                        style={{ width: "min(520px, 100%)", height: "auto" }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="erd-dialog-header">
                            <span id="erd-glossary-import-title">
                                {t(
                                    importPrompt.kind === "choose"
                                        ? "dialog.glossary.importTitle"
                                        : "dialog.glossary.importFailedTitle",
                                )}
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
                                {importPrompt.kind === "choose"
                                    ? t("dialog.glossary.importPrompt", {
                                          count: importPrompt.entries.length,
                                      })
                                    : t("dialog.glossary.importFailed", {
                                          message: importPrompt.message,
                                      })}
                            </p>
                        </div>
                        <div className="erd-dialog-footer">
                            {importPrompt.kind === "choose" ? (
                                <>
                                    <button
                                        type="button"
                                        className="erd-btn erd-btn--primary"
                                        onClick={() => applyImport("merge")}
                                    >
                                        {t("dialog.glossary.importMerge")}
                                    </button>
                                    <button
                                        type="button"
                                        className="erd-btn erd-btn--ghost"
                                        onClick={() => applyImport("replace")}
                                    >
                                        {t("dialog.glossary.importReplace")}
                                    </button>
                                    <button
                                        type="button"
                                        className="erd-btn erd-btn--ghost"
                                        onClick={() => setImportPrompt(null)}
                                    >
                                        {t("dialog.cancel")}
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    className="erd-btn erd-btn--primary"
                                    onClick={() => setImportPrompt(null)}
                                >
                                    {t("dialog.close")}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
            {closeConfirmOpen ? (
                <div
                    className="erd-dialog-backdrop erd-dialog-backdrop--nested"
                    role="presentation"
                >
                    <div
                        className="erd-dialog"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="erd-glossary-close-confirm-title"
                        style={{ width: "min(520px, 100%)", height: "auto" }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="erd-dialog-header">
                            <span id="erd-glossary-close-confirm-title">
                                {t("dialog.confirm.glossary.closeTitle")}
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
                                {t("dialog.confirm.glossary.close")}
                            </p>
                        </div>
                        <div className="erd-dialog-footer">
                            <button
                                type="button"
                                className="erd-btn erd-btn--primary"
                                autoFocus
                                onClick={() => {
                                    commitDraft();
                                    setCloseConfirmOpen(false);
                                    onClose();
                                }}
                            >
                                {t("dialog.confirm.glossary.save")}
                            </button>
                            <button
                                type="button"
                                className="erd-btn erd-btn--ghost"
                                onClick={() => {
                                    setCloseConfirmOpen(false);
                                    onClose();
                                }}
                            >
                                {t("dialog.confirm.glossary.discard")}
                            </button>
                            <button
                                type="button"
                                className="erd-btn erd-btn--ghost"
                                onClick={() => setCloseConfirmOpen(false)}
                            >
                                {t("dialog.cancel")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
