import { enBundle } from "./bundles/en";
import { koBundle } from "./bundles/ko";
import type { I18nKey, I18nVars } from "./types";

function applyVars(template: string, vars?: I18nVars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ""));
}

function resolveBundle(locale: string | undefined): Record<I18nKey, string> {
  const lc = (locale ?? "ko").toLowerCase();
  if (lc.startsWith("ko")) return koBundle;
  return enBundle;
}

export type CreateTranslatorOptions = {
  /** When set, only this function is used (host i18n). */
  t?: (key: I18nKey, vars?: I18nVars) => string;
  /** BCP-47-like tag; `ko*` → Korean bundle, otherwise English. Default `ko`. */
  locale?: string;
  /** Merged on top of the resolved locale bundle; then English fallback for missing keys. */
  translations?: Partial<Record<I18nKey, string>>;
};

/**
 * Hybrid i18n: `t` wins; else `translations` over locale bundle over `en` fallback; missing key returns the key.
 */
export function createTranslator(options: CreateTranslatorOptions): (key: I18nKey, vars?: I18nVars) => string {
  const { t: hostT, locale = "ko", translations } = options;
  if (hostT) {
    return (key, vars) => hostT(key, vars);
  }
  const primary = resolveBundle(locale);
  return (key, vars) => {
    const raw = translations?.[key] ?? primary[key] ?? enBundle[key] ?? key;
    return applyVars(raw, vars);
  };
}
