import { ipcMain } from "electron";

import type { ExtensionQuery, MarketplaceExtension } from "../../marketplace/api";
import { getMarketplaceBaseUrl, startMarketplaceServer } from "./marketplace-server";

async function marketplaceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const started = await startMarketplaceServer();
  if (!started) {
    throw new Error("Marketplace server failed to start on port 8787");
  }
  const base = getMarketplaceBaseUrl().replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    throw new Error(`Marketplace request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function registerMarketplaceHandlers(): void {
  ipcMain.handle("marketplace:health", async () => {
    const url = getMarketplaceBaseUrl();
    const started = await startMarketplaceServer();
    if (!started) {
      return { ok: false, url };
    }
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/health`, {
        signal: AbortSignal.timeout(2_500),
      });
      return { ok: res.ok, url };
    } catch {
      return { ok: false, url };
    }
  });

  ipcMain.handle("marketplace:search", async (_event, query: ExtensionQuery) => {
    const params = new URLSearchParams();
    if (query?.text) params.set("q", query.text);
    if (query?.category) params.set("category", query.category);
    if (query?.sortBy) params.set("sortBy", query.sortBy);
    if (query?.limit) params.set("limit", String(query.limit));
    const suffix = params.toString();
    return marketplaceFetch<MarketplaceExtension[]>(`/api/search${suffix ? `?${suffix}` : ""}`);
  });

  ipcMain.handle(
    "marketplace:autocomplete",
    async (_event, input: { q: string; mode?: string }) => {
      const params = new URLSearchParams();
      params.set("q", input?.q ?? "");
      if (input?.mode) params.set("mode", input.mode);
      return marketplaceFetch<string[]>(`/api/search/autocomplete?${params}`);
    }
  );

  ipcMain.handle("marketplace:categories", async () => {
    return marketplaceFetch<string[]>("/api/extensions/categories");
  });
}
