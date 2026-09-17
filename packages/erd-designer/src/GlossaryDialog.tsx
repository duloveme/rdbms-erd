"use client";

import type { GlossaryEntry } from "@rdbms-erd/core";
import { createId } from "@rdbms-erd/core";
import {
    FileJson,
    FolderOpen,
    GripVertical,
    Maximize2,
    Minimize2,
    Plus,
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
import { downloadJsonFile, sanitizeFileBase } from "./fileDownload";
import type { GlossaryMatchKey } from "./glossary";
import {
    findDuplicateGlossaryKeys,
    glossaryEntriesEqual,
    glossaryEntryMatchesQuery,
    mergeGlossaryEntries,
    moveGlossaryEntry,
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

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 360;
const BACKDROP_PAD = 24;

type ResizeEdge = "e" | "s" | "se";

function clampDialogSize(width: number, height: number) {
    const maxW = Math.max(
        MIN_WIDTH,
        (typeof window !== "undefined" ? window.innerWidth : 1200) -
            BACKDROP_PAD * 2,
    );
    const maxH = Math.max(
        MIN_HEIGHT,
        (typeof window !== "undefined" ? window.innerHeight : 800) -
            BACKDROP_PAD * 2,
    );
    return {
        width: Math.min(Math.max(width, MIN_WIDTH), maxW),
        height: Math.min(Math.max(height, MIN_HEIGHT), maxH),
    };
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
    const [searchQuery, setSearchQuery] = useState("");
    const [saveError, setSaveError] = useState<string | null>(null);
    const [duplicateIds, setDuplicateIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [size, setSize] = useState(() =>
        clampDialogSize(DEFAULT_WIDTH, DEFAULT_HEIGHT),
    );
    const [maximized, setMaximized] = useState(false);
    const sizeBeforeMaximizeRef = useRef(size);
    const resizeSessionRef = useRef<{
        edge: ResizeEdge;
        startX: number;
        startY: number;
        startW: number;
        startH: number;
    } | null>(null);

    // 닫힘 -> 열림 전환에서만 초기화한다. `entries`가 갱신될 때마다 초기화하면
    // 편집 중인 draft가 지워진다. 크기·최대화는 세션 동안 유지한다.
    useEffect(() => {
        if (open && !wasOpenRef.current) {
            setDraft(entries.map((e) => ({ ...e })));
            setSelectedIds(new Set());
            setCloseConfirmOpen(false);
            setImportPrompt(null);
            setPendingFocusId(null);
            setSearchQuery("");
            setSaveError(null);
            setDuplicateIds(new Set());
            setDraggingId(null);
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

    const filteredDraft = useMemo(
        () => draft.filter((e) => glossaryEntryMatchesQuery(e, searchQuery)),
        [draft, searchQuery],
    );

    const allVisibleSelected = useMemo(
        () =>
            filteredDraft.length > 0 &&
            filteredDraft.every((e) => selectedIds.has(e.id)),
        [filteredDraft, selectedIds],
    );

    const dirty = !glossaryEntriesEqual(draft, entries);

    const clearSaveError = () => {
        if (saveError) setSaveError(null);
        if (duplicateIds.size > 0) setDuplicateIds(new Set());
    };

    const validateBeforeCommit = (): boolean => {
        const dups = findDuplicateGlossaryKeys(draft, glossaryMatchKey);
        if (dups.size === 0) {
            setSaveError(null);
            setDuplicateIds(new Set());
            return true;
        }
        setDuplicateIds(dups);
        setSaveError(
            t(
                glossaryMatchKey === "logical"
                    ? "dialog.glossary.errorDuplicateLogical"
                    : "dialog.glossary.errorDuplicatePhysical",
            ),
        );
        return false;
    };

    const toggleAllVisible = () => {
        if (allVisibleSelected) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const e of filteredDraft) next.delete(e.id);
                return next;
            });
            return;
        }
        setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const e of filteredDraft) next.add(e.id);
            return next;
        });
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
        clearSaveError();
        setDraft((prev) =>
            prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        );
    };

    const addRow = () => {
        clearSaveError();
        setSearchQuery("");
        const id = createId("gloss");
        setDraft((prev) => [...prev, { id, logicalName: "", physicalName: "" }]);
        setSelectedIds((prev) => new Set(prev).add(id));
        setPendingFocusId(id);
    };

    const deleteSelected = () => {
        if (selectedIds.size === 0) return;
        clearSaveError();
        setDraft((prev) => prev.filter((e) => !selectedIds.has(e.id)));
        setSelectedIds(new Set());
    };

    const commitDraft = (): boolean => {
        if (!validateBeforeCommit()) return false;
        onChange(draft);
        return true;
    };

    const applySelected = () => {
        const ids = [...selectedIds].filter((id) => {
            const e = draft.find((x) => x.id === id);
            return e && e.logicalName.trim() && e.physicalName.trim();
        });
        if (ids.length === 0) return;
        if (!commitDraft()) return;
        onApplySelected(ids);
    };

    const requestClose = () => {
        if (dirty) {
            setCloseConfirmOpen(true);
            return;
        }
        onClose();
    };

    const toggleMaximized = useCallback(() => {
        setMaximized((prev) => {
            if (!prev) {
                sizeBeforeMaximizeRef.current = size;
                return true;
            }
            setSize(clampDialogSize(
                sizeBeforeMaximizeRef.current.width,
                sizeBeforeMaximizeRef.current.height,
            ));
            return false;
        });
    }, [size]);

    const onResizePointerDown = useCallback(
        (edge: ResizeEdge) => (e: React.PointerEvent) => {
            if (maximized) return;
            e.preventDefault();
            e.stopPropagation();
            resizeSessionRef.current = {
                edge,
                startX: e.clientX,
                startY: e.clientY,
                startW: size.width,
                startH: size.height,
            };
            const handleMove = (ev: PointerEvent) => {
                const session = resizeSessionRef.current;
                if (!session) return;
                const dx = ev.clientX - session.startX;
                const dy = ev.clientY - session.startY;
                let nextW = session.startW;
                let nextH = session.startH;
                if (session.edge === "e" || session.edge === "se") {
                    nextW = session.startW + dx;
                }
                if (session.edge === "s" || session.edge === "se") {
                    nextH = session.startH + dy;
                }
                setSize(clampDialogSize(nextW, nextH));
            };
            const handleUp = () => {
                resizeSessionRef.current = null;
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", handleUp);
            };
            window.addEventListener("pointermove", handleMove);
            window.addEventListener("pointerup", handleUp);
        },
        [maximized, size.height, size.width],
    );

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
            clearSaveError();
            setDraft(imported);
            return;
        }
        setImportPrompt({ kind: "choose", entries: imported });
    };

    const applyImport = (mode: "replace" | "merge") => {
        if (importPrompt?.kind !== "choose") return;
        clearSaveError();
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

    const moveRowTo = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        clearSaveError();
        setDraft((prev) => {
            const fromIndex = prev.findIndex((e) => e.id === fromId);
            const toIndex = prev.findIndex((e) => e.id === toId);
            if (fromIndex < 0 || toIndex < 0) return prev;
            return moveGlossaryEntry(prev, fromIndex, toIndex);
        });
    };

    const physicalFirst = glossaryMatchKey === "physical";
    const firstHeaderKey = physicalFirst
        ? "dialog.glossary.physicalName"
        : "dialog.glossary.logicalName";
    const secondHeaderKey = physicalFirst
        ? "dialog.glossary.logicalName"
        : "dialog.glossary.physicalName";
    const rowGridColumns = "28px 20px 1fr 1fr";

    if (!open) return null;

    const dialogStyle: React.CSSProperties = maximized
        ? {
              width: "100%",
              height: "100%",
              maxHeight: "none",
          }
        : {
              width: size.width,
              height: size.height,
              maxHeight: "none",
              maxWidth: "100%",
          };

    const renderNameInputs = (entry: GlossaryEntry) => {
        const isDup = duplicateIds.has(entry.id);
        const logicalInvalid = isDup && glossaryMatchKey === "logical";
        const physicalInvalid = isDup && glossaryMatchKey === "physical";
        const logicalInput = (
            <input
                className={`erd-input${logicalInvalid ? " erd-input--invalid" : ""}`}
                ref={
                    physicalFirst
                        ? undefined
                        : (el) => registerRowInput(entry.id, el)
                }
                value={entry.logicalName}
                onChange={(e) =>
                    updateEntry(entry.id, { logicalName: e.target.value })
                }
                placeholder={t("dialog.glossary.logicalName")}
                aria-invalid={logicalInvalid || undefined}
            />
        );
        const physicalInput = (
            <input
                className={`erd-input${physicalInvalid ? " erd-input--invalid" : ""}`}
                ref={
                    physicalFirst
                        ? (el) => registerRowInput(entry.id, el)
                        : undefined
                }
                value={entry.physicalName}
                onChange={(e) =>
                    updateEntry(entry.id, { physicalName: e.target.value })
                }
                placeholder={t("dialog.glossary.physicalName")}
                aria-invalid={physicalInvalid || undefined}
            />
        );
        return physicalFirst ? (
            <>
                {physicalInput}
                {logicalInput}
            </>
        ) : (
            <>
                {logicalInput}
                {physicalInput}
            </>
        );
    };

    return (
        <div className="erd-dialog-backdrop" role="presentation">
            <div
                className={`erd-dialog erd-dialog--glossary${maximized ? " erd-dialog--glossary-maximized" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="erd-glossary-dialog-title"
                style={dialogStyle}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div
                    className="erd-dialog-header"
                    onDoubleClick={(e) => {
                        if (
                            (e.target as HTMLElement).closest(
                                "button, input, a",
                            )
                        ) {
                            return;
                        }
                        toggleMaximized();
                    }}
                >
                    <span id="erd-glossary-dialog-title">
                        {t("dialog.glossary.title")}
                    </span>
                    <div className="erd-dialog-header-actions">
                        <button
                            type="button"
                            className="erd-dialog-icon-btn"
                            aria-label={t(
                                maximized
                                    ? "dialog.glossary.restore"
                                    : "dialog.glossary.maximize",
                            )}
                            title={t(
                                maximized
                                    ? "dialog.glossary.restore"
                                    : "dialog.glossary.maximize",
                            )}
                            onClick={toggleMaximized}
                        >
                            {maximized ? (
                                <Minimize2 size={16} />
                            ) : (
                                <Maximize2 size={16} />
                            )}
                        </button>
                        <button
                            type="button"
                            className="erd-dialog-icon-btn"
                            aria-label={t("dialog.close")}
                            onClick={requestClose}
                        >
                            <X size={16} />
                        </button>
                    </div>
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
                    <input
                        className="erd-input"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t("dialog.glossary.searchPlaceholder")}
                        aria-label={t("dialog.glossary.searchPlaceholder")}
                    />
                    <div
                        className="erd-glossary-list"
                        onDragOver={(e) => {
                            if (draggingId == null) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                        }}
                    >
                        <div
                            className="erd-glossary-list-header"
                            style={{ gridTemplateColumns: rowGridColumns }}
                        >
                            <label title={t("dialog.glossary.selectAll")}>
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleAllVisible}
                                    aria-label={t("dialog.glossary.selectAll")}
                                />
                            </label>
                            <span aria-hidden="true" />
                            <span>{t(firstHeaderKey)}</span>
                            <span>{t(secondHeaderKey)}</span>
                        </div>
                        {draft.length === 0 ? (
                            <p className="erd-glossary-list-empty">
                                {t("dialog.glossary.empty")}
                            </p>
                        ) : filteredDraft.length === 0 ? (
                            <p className="erd-glossary-list-empty">
                                {t("dialog.glossary.filterEmpty")}
                            </p>
                        ) : (
                            filteredDraft.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="erd-glossary-row"
                                    style={{
                                        gridTemplateColumns: rowGridColumns,
                                    }}
                                    onDragOver={(e) => {
                                        if (draggingId == null) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = "move";
                                    }}
                                    onDrop={(e) => {
                                        if (draggingId == null) return;
                                        e.preventDefault();
                                        moveRowTo(draggingId, entry.id);
                                        setDraggingId(null);
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(entry.id)}
                                        onChange={() => toggleOne(entry.id)}
                                    />
                                    <span
                                        className="erd-glossary-drag-grip"
                                        draggable
                                        title={t("dialog.glossary.reorder")}
                                        aria-label={t(
                                            "dialog.glossary.reorder",
                                        )}
                                        onDragStart={(e) => {
                                            e.dataTransfer.effectAllowed =
                                                "move";
                                            e.dataTransfer.setData(
                                                "text/plain",
                                                entry.id,
                                            );
                                            setDraggingId(entry.id);
                                        }}
                                        onDragEnd={() => setDraggingId(null)}
                                    >
                                        <GripVertical
                                            size={12}
                                            strokeWidth={2}
                                        />
                                    </span>
                                    {renderNameInputs(entry)}
                                </div>
                            ))
                        )}
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
                            alignItems: "center",
                        }}
                    >
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
                            onClick={() => {
                                void commitDraft();
                            }}
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
                {!maximized ? (
                    <>
                        <div
                            className="erd-dialog-resize-handle erd-dialog-resize-handle--e"
                            onPointerDown={onResizePointerDown("e")}
                        />
                        <div
                            className="erd-dialog-resize-handle erd-dialog-resize-handle--s"
                            onPointerDown={onResizePointerDown("s")}
                        />
                        <div
                            className="erd-dialog-resize-handle erd-dialog-resize-handle--se"
                            onPointerDown={onResizePointerDown("se")}
                        />
                    </>
                ) : null}
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
                                    if (!commitDraft()) return;
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
