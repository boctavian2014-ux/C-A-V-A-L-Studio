import type { ExtensionQuery, ExtensionRating, ExtensionVersion, MarketplaceApi, MarketplaceExtension } from "../api";

export class MarketplaceClient implements MarketplaceApi {
  constructor(private readonly baseUrl: string) {}

  async search(query: ExtensionQuery): Promise<MarketplaceExtension[]> {
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
}
