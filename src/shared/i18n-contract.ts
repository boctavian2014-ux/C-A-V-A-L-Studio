/**
 * Shared i18n contract — no runtime UI deps.
 * Add a locale by registering it in SUPPORTED_LOCALES + a dictionary module.
 */

export const SUPPORTED_LOCALES = ["en", "ro"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export const LOCALE_SETTING_KEY = "ui.locale" as const;

/** Native display names for the language picker (not translated). */
export const LOCALE_NATIVE_LABELS: Record<AppLocale, string> = {
  en: "English",
  ro: "Română",
};

export function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Map BCP-47 / OS tags to a supported app locale.
 * Examples: ro-RO → ro, en-US → en, fr-FR → en (fallback).
 */
export function resolveLocale(input?: string | null): AppLocale {
  if (!input || typeof input !== "string") return DEFAULT_LOCALE;
  const normalized = input.trim().replace(/_/g, "-");
  if (!normalized) return DEFAULT_LOCALE;
  const lower = normalized.toLowerCase();
  if (isSupportedLocale(lower)) return lower;
  const base = lower.split("-")[0];
  if (base && isSupportedLocale(base)) return base;
  return DEFAULT_LOCALE;
}

export function interpolate(
  template: string,
  values?: Record<string, string | number>
): string {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return match;
    const v = values[key];
    return v == null ? match : String(v);
  });
}
