import { useEffect, useState } from "react";
import type { MarketplaceExtension } from "../../api";
import { MarketplaceClient } from "../marketplace-client";

export const useExtensions = (baseUrl: string, category?: string) => {
  const [extensions, setExtensions] = useState<MarketplaceExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new MarketplaceClient(baseUrl);
    setLoading(true);
    client.search({ category, sortBy: "trending", limit: 50 })
      .then(setExtensions)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, [baseUrl, category]);

  return { extensions, loading, error };
};
