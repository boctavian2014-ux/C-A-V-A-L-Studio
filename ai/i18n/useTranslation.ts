import { useI18n } from "./I18nProvider";
import type { MessageKey, TranslateFn, TranslateValues } from "./index";
import type { AppLocale } from "./index";

export function useTranslation(): {
  t: TranslateFn;
  locale: AppLocale;
  setLocale: (locale: AppLocale | string) => Promise<void>;
  ready: boolean;
} {
  const { t, locale, setLocale, ready } = useI18n();
  return { t, locale, setLocale, ready };
}

export type { MessageKey, TranslateFn, TranslateValues, AppLocale };
