import { useEffect, useState } from "react";

import type { MarketplaceExtension } from "../../api";

const DEBOUNCE_MS = 300;

export function useOpenVsxSearch(query: string) {
  const [popular, setPopular] = useState<MarketplaceExtension[]>([]);
  const [results, setResults] = useState<MarketplaceExtension[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingPopular(true);
      setError(null);
      try {
        const res = await window.caval.openvsx?.popular?.();
        if (cancelled) return;
        if (!res?.ok) {
          setError(res?.error ?? "Nu am putut încărca extensiile populare.");
          setPopular([]);
          return;
        }
        setPopular((res.extensions ?? []) as MarketplaceExtension[]);
      } catch (cause: unknown) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setPopular([]);
        }
      } finally {
        if (!cancelled) setLoadingPopular(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoadingSearch(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setLoadingSearch(true);
        setError(null);
        try {
          const res = await window.caval.openvsx?.search?.(trimmed);
          if (cancelled) return;
          if (!res?.ok) {
            setError(res?.error ?? "Căutare eșuată.");
            setResults([]);
            return;
          }
          setResults((res.extensions ?? []) as MarketplaceExtension[]);
        } catch (cause: unknown) {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause));
            setResults([]);
          }
        } finally {
          if (!cancelled) setLoadingSearch(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const hasQuery = query.trim().length > 0;

  return {
    extensions: hasQuery ? results : popular,
    loading: hasQuery ? loadingSearch : loadingPopular,
    error,
    isPopular: !hasQuery,
  };
}
