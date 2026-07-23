import { useCallback, useEffect, useRef, useState } from 'react';
import type { CavalModelCatalog } from '../../src/main/preload';
import { OPENROUTER_CATALOG_TTL_MS } from '../models/openrouter-catalog';

/** Soft re-check when the window regains focus (avoids hammering IPC). */
const FOCUS_SOFT_LOAD_THROTTLE_MS = 5 * 60_000;

function getCavalApi() {
  return (window as unknown as {
    caval?: {
      modelsList?: () => Promise<{ catalog?: CavalModelCatalog }>;
      modelsRefresh?: () => Promise<{ catalog?: CavalModelCatalog }>;
    };
  }).caval;
}

export function useModelCatalog() {
  const [catalog, setCatalog] = useState<CavalModelCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSoftLoadAtRef = useRef(0);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const caval = getCavalApi();
      const result = refresh
        ? await caval?.modelsRefresh?.()
        : await caval?.modelsList?.();
      if (result?.catalog) setCatalog(result.catalog);
      if (!refresh) lastSoftLoadAtRef.current = Date.now();
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(true), [load]);

  const softLoadThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastSoftLoadAtRef.current < FOCUS_SOFT_LOAD_THROTTLE_MS) return;
    void load(false);
  }, [load]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void load(false);
    }, OPENROUTER_CATALOG_TTL_MS);

    const onFocus = () => softLoadThrottled();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') softLoadThrottled();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, softLoadThrottled]);

  return { catalog, loading, load, refresh };
}
