import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_SETTING_KEY,
  resolveLocale,
  type AppLocale,
} from "../shared/i18n-contract";

export type LocaleSource = "saved" | "system" | "default";

export function readSavedLocale(settings: Record<string, string>): AppLocale | null {
  const raw = settings[LOCALE_SETTING_KEY];
  if (raw && isSupportedLocale(raw.trim())) return raw.trim() as AppLocale;
  return null;
}

export function resolveLocalePreference(
  settings: Record<string, string>,
  systemLocale?: string | null
): { locale: AppLocale; source: LocaleSource } {
  const saved = readSavedLocale(settings);
  if (saved) return { locale: saved, source: "saved" };
  if (systemLocale?.trim()) {
    return { locale: resolveLocale(systemLocale), source: "system" };
  }
  return { locale: DEFAULT_LOCALE, source: "default" };
}

export function applyLocaleToSettings(
  settings: Record<string, string>,
  localeInput: unknown
): { ok: true; locale: AppLocale; settings: Record<string, string> } | { ok: false; error: string } {
  if (!isSupportedLocale(localeInput)) {
    return { ok: false, error: "Unsupported locale" };
  }
  return {
    ok: true,
    locale: localeInput,
    settings: { ...settings, [LOCALE_SETTING_KEY]: localeInput },
  };
}
