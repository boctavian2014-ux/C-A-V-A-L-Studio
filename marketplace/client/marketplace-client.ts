import type { ExtensionQuery, ExtensionRating, ExtensionVersion, MarketplaceApi, MarketplaceExtension } from "../api";

type MarketplaceBridge = {
  health?: () => Promise<{ ok: boolean; url?: string }>;
  search?: (query: ExtensionQuery) => Promise<MarketplaceExtension[]>;
  autocomplete?: (input: { q: string; mode?: string }) => Promise<string[]>;
  categories?: () => Promise<string[]>;
};

function getBridge(): MarketplaceBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { caval?: { marketplace?: MarketplaceBridge } }).caval?.marketplace;
}

export class MarketplaceClient implements MarketplaceApi {
  constructor(private readonly baseUrl: string) {}

  async search(query: ExtensionQuery): Promise<MarketplaceExtension[]> {
    const bridge = getBridge();
    if (bridge?.search) {
      return bridge.search(query);
    }

    const params = new URLSearchParams();
    if (query.text) params.set("q", query.text);
    if (query.category) params.set("category", query.category);
    if (query.sortBy) params.set("sortBy", query.sortBy);
    if (query.limit) params.set("limit", String(query.limit));
    const response = await fetch(`${this.baseUrl}/api/search?${params}`);
    return response.json() as Promise<MarketplaceExtension[]>;
  }

  async get(extensionId: string): Promise<MarketplaceExtension | null> {
    const response = await fetch(`${this.baseUrl}/api/extensions/${extensionId}`);
    if (response.status === 404) {
      return null;
    }

    return response.json() as Promise<MarketplaceExtension>;
  }

  async publish(extension: MarketplaceExtension): Promise<void> {
    await fetch(`${this.baseUrl}/api/extensions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest: extension })
    });
  }

  async listCategories(): Promise<string[]> {
    const bridge = getBridge();
    if (bridge?.categories) {
      return bridge.categories();
    }

    const response = await fetch(`${this.baseUrl}/api/extensions/categories`);
    return response.json() as Promise<string[]>;
  }

  async rate(rating: ExtensionRating): Promise<void> {
    await fetch(`${this.baseUrl}/api/ratings/${rating.extensionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rating)
    });
  }

  async download(extensionId: string): Promise<ExtensionVersion | null> {
    const response = await fetch(`${this.baseUrl}/api/extensions/${extensionId}/download`);
    if (response.status === 404) {
      return null;
    }

    return response.json() as Promise<ExtensionVersion>;
  }

  static async health(baseUrl: string): Promise<boolean> {
    const bridge = getBridge();
    if (bridge?.health) {
      const res = await bridge.health();
      return res.ok;
    }
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
        signal: AbortSignal.timeout(2_500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async autocomplete(baseUrl: string, query: string, mode = "hybrid"): Promise<string[]> {
    const bridge = getBridge();
    if (bridge?.autocomplete) {
      return bridge.autocomplete({ q: query, mode });
    }
    const params = new URLSearchParams({ q: query, mode });
    const response = await fetch(`${baseUrl}/api/search/autocomplete?${params}`);
    return response.json() as Promise<string[]>;
  }

  static async searchHybrid(baseUrl: string, query: string): Promise<MarketplaceExtension[]> {
    const bridge = getBridge();
    if (bridge?.search) {
      return bridge.search({ text: query, sortBy: "relevance", limit: 50 });
    }
    const params = new URLSearchParams({ q: query, mode: "hybrid" });
    const response = await fetch(`${baseUrl}/api/search?${params}`);
    return response.json() as Promise<MarketplaceExtension[]>;
  }
}
