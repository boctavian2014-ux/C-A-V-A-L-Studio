import {
  DEFAULT_LOCALE,
  interpolate,
  resolveLocale,
  type AppLocale,
} from "../../src/shared/i18n-contract";
import { en, type MessageCatalog, type MessageKey } from "./locales/en";
import { ro } from "./locales/ro";

export type { MessageCatalog, MessageKey };
export {
  DEFAULT_LOCALE,
  LOCALE_NATIVE_LABELS,
  LOCALE_SETTING_KEY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  resolveLocale,
  type AppLocale,
} from "../../src/shared/i18n-contract";

export const dictionaries: Record<AppLocale, MessageCatalog> = {
  en,
  ro,
};

export type TranslateValues = Record<string, string | number>;

export type TranslateFn = (key: MessageKey | string, values?: TranslateValues) => string;

/** Pure translator — never throws; falls back to English, then the key. */
export function createTranslator(locale: AppLocale): TranslateFn {
  const primary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const fallback = dictionaries[DEFAULT_LOCALE];

  return (key, values) => {
    const k = key as MessageKey;
    const raw =
      (primary && primary[k]) ||
      (fallback && fallback[k]) ||
      (typeof key === "string" ? key : String(key));
    try {
      return interpolate(raw, values);
    } catch {
      return raw;
    }
  };
}

export function translate(
  localeInput: string | null | undefined,
  key: MessageKey | string,
  values?: TranslateValues
): string {
  return createTranslator(resolveLocale(localeInput))(key, values);
}
