import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createTranslator,
  DEFAULT_LOCALE,
  resolveLocale,
  type AppLocale,
  type MessageKey,
  type TranslateFn,
  type TranslateValues,
} from "./index";

export interface I18nContextValue {
  locale: AppLocale;
  ready: boolean;
  t: TranslateFn;
  setLocale: (locale: AppLocale | string) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

async function loadPreferredLocale(fallbackHint?: string | null): Promise<AppLocale> {
  try {
    const res = await window.caval?.locale?.get?.();
    if (res?.ok && res.locale) return resolveLocale(res.locale);
  } catch {
    // fall through
  }
  if (fallbackHint) return resolveLocale(fallbackHint);
  if (typeof navigator !== "undefined" && navigator.language) {
    return resolveLocale(navigator.language);
  }
  return DEFAULT_LOCALE;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  /** Test / SSR override — skips async load when set. */
  initialLocale?: AppLocale;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(
    initialLocale ?? DEFAULT_LOCALE
  );
  const [ready, setReady] = useState(Boolean(initialLocale));

  useEffect(() => {
    if (initialLocale) {
      setLocaleState(initialLocale);
      setReady(true);
      return;
    }
    let cancelled = false;
    void loadPreferredLocale().then((next) => {
      if (cancelled) return;
      setLocaleState(next);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialLocale]);

  const setLocale = useCallback(async (next: AppLocale | string) => {
    const resolved = resolveLocale(next);
    setLocaleState(resolved);
    try {
      await window.caval?.locale?.set?.(resolved);
    } catch {
      // UI already updated; persistence best-effort
    }
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, ready, t, setLocale }),
    [locale, ready, t, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    const t: TranslateFn = (key, values) =>
      createTranslator(DEFAULT_LOCALE)(key as MessageKey, values as TranslateValues);
    return {
      locale: DEFAULT_LOCALE,
      ready: true,
      t,
      setLocale: async () => undefined,
    };
  }
  return ctx;
}
