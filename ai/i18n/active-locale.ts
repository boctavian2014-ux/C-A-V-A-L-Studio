import {
  DEFAULT_LOCALE,
  resolveLocale,
  type AppLocale,
} from "../../src/shared/i18n-contract";
import { createTranslator, type TranslateFn, type TranslateValues } from "./index";
import type { MessageKey } from "./locales/en";

/** Sync mirror of I18nProvider locale for non-React call sites (toasts, stores, menus). */
let activeLocale: AppLocale = DEFAULT_LOCALE;

export function getActiveLocale(): AppLocale {
  return activeLocale;
}

export function setActiveLocale(locale: AppLocale | string): AppLocale {
  activeLocale = resolveLocale(locale);
  return activeLocale;
}

export function createActiveTranslator(): TranslateFn {
  return createTranslator(activeLocale);
}

/** Translate using the current UI locale (falls back to English catalog). */
export function tActive(key: MessageKey | string, values?: TranslateValues): string {
  return createTranslator(activeLocale)(key, values);
}
