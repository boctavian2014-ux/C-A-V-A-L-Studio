import { useEffect, useState } from "react";
import type { MarketplaceExtension } from "../../api";

export const useSearch = (baseUrl: string, query: string) => {
  const [results, setResults] = useState<MarketplaceExtension[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ q: query, mode: "hybrid" });

    Promise.all([
      fetch(`${baseUrl}/api/search?${params}`, { signal: controller.signal }).then((response) => response.json() as Promise<MarketplaceExtension[]>),
      fetch(`${baseUrl}/api/search/autocomplete?${params}`, { signal: controller.signal }).then((response) => response.json() as Promise<string[]>)
    ]).then(([nextResults, nextSuggestions]) => {
      setResults(nextResults);
      setSuggestions(nextSuggestions);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setResults([]);
        setSuggestions([]);
      }
    });

    return () => controller.abort();
  }, [baseUrl, query]);

  return { results, suggestions };
};
