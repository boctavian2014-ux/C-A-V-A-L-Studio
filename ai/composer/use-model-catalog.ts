import { useCallback, useEffect, useState } from 'react';
import type { CavalModelCatalog } from '../../src/main/preload';

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

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const caval = getCavalApi();
      const result = refresh
        ? await caval?.modelsRefresh?.()
        : await caval?.modelsList?.();
      if (result?.catalog) setCatalog(result.catalog);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    void load(false);
  }, [load]);

  return { catalog, loading, load, refresh };
}
