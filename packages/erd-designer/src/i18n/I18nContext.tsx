"use client";

import React, { createContext, useContext, useMemo } from "react";
import { createTranslator, type CreateTranslatorOptions } from "./createTranslator";
import type { I18nKey, I18nVars } from "./types";

export type ErdI18nContextValue = {
  t: (key: I18nKey, vars?: I18nVars) => string;
  locale: string;
};

const ErdI18nContext = createContext<ErdI18nContextValue | null>(null);

export type ErdI18nProviderProps = {
  children: React.ReactNode;
} & CreateTranslatorOptions;

export function ErdI18nProvider({ children, t, locale = "ko", translations }: ErdI18nProviderProps) {
  const value = useMemo<ErdI18nContextValue>(() => {
    const tr = createTranslator({ t, locale, translations });
    return { t: tr, locale };
  }, [t, locale, translations]);
  return <ErdI18nContext.Provider value={value}>{children}</ErdI18nContext.Provider>;
}

export function useErdI18n(): ErdI18nContextValue {
  const ctx = useContext(ErdI18nContext);
  if (!ctx) {
    throw new Error("useErdI18n must be used within ErdI18nProvider (or use ERDDesigner which provides it).");
  }
  return ctx;
}

/**
 * Prefer context from `ERDDesigner` / `ErdI18nProvider`; otherwise build a translator from the same props
 * as `ErdI18nProvider` (for standalone `TableEditDialog`).
 */
export function useErdTranslator(options: CreateTranslatorOptions): ErdI18nContextValue {
  const ctx = useContext(ErdI18nContext);
  const { locale = "ko", translations, t } = options;
  return useMemo(() => {
    if (ctx) return ctx;
    const tr = createTranslator({ locale, translations, t });
    return { t: tr, locale };
  }, [ctx, locale, translations, t]);
}
