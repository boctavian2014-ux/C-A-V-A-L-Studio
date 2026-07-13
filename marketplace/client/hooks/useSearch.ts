import { useEffect, useState } from "react";
import type { MarketplaceExtension } from "../../api";
import { MarketplaceClient } from "../marketplace-client";

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

    Promise.all([
      MarketplaceClient.searchHybrid(baseUrl, query),
      MarketplaceClient.autocomplete(baseUrl, query, "hybrid"),
    ])
      .then(([nextResults, nextSuggestions]) => {
        if (!controller.signal.aborted) {
          setResults(nextResults);
          setSuggestions(nextSuggestions);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResults([]);
          setSuggestions([]);
        }
      });

    return () => controller.abort();
  }, [baseUrl, query]);

  return { results, suggestions };
};
