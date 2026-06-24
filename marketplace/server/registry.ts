import type { ExtensionQuery, ExtensionRating, ExtensionVersion, MarketplaceApi, MarketplaceExtension } from "../api";

export class MarketplaceRegistry implements MarketplaceApi {
  private readonly extensions = new Map<string, MarketplaceExtension>();
  private readonly versions = new Map<string, ExtensionVersion[]>();
  private readonly ratings = new Map<string, ExtensionRating[]>();
  private readonly downloads = new Map<string, number>();

  async search(query: ExtensionQuery): Promise<MarketplaceExtension[]> {
    const text = query.text?.toLowerCase();

    return [...this.extensions.values()].filter((extension) => {
      const matchesText = !text || `${extension.displayName} ${extension.description}`.toLowerCase().includes(text);
      const matchesCategory = !query.category || extension.categories.includes(query.category);
      const matchesVerified = !query.verifiedOnly || extension.cavalVerified;
      return matchesText && matchesCategory && matchesVerified;
    }).sort((left, right) => this.compare(left, right, query.sortBy ?? "relevance", text))
      .slice(0, query.limit ?? 50);
  }

  async get(extensionId: string): Promise<MarketplaceExtension | null> {
    return this.extensions.get(extensionId) ?? null;
  }

  async publish(extension: MarketplaceExtension): Promise<void> {
    this.extensions.set(extension.id, extension);
  }

  async publishVersion(version: ExtensionVersion): Promise<void> {
    const versions = this.versions.get(version.extensionId) ?? [];
    versions.push(version);
    this.versions.set(version.extensionId, versions);

    const extension = this.extensions.get(version.extensionId);
    if (extension) {
      this.extensions.set(extension.id, {
        ...extension,
        version: version.version,
        latestVersionId: version.id,
        updatedAt: new Date().toISOString()
      });
    }
  }

  async versionsFor(extensionId: string): Promise<ExtensionVersion[]> {
    return this.versions.get(extensionId) ?? [];
  }

  async listCategories(): Promise<string[]> {
    return [...new Set([...this.extensions.values()].flatMap((extension) => extension.categories))].sort();
  }

  async featured(): Promise<MarketplaceExtension[]> {
    return [...this.extensions.values()].filter((extension) => extension.featured);
  }

  async trending(): Promise<MarketplaceExtension[]> {
    return [...this.extensions.values()].sort((left, right) => right.trendingScore - left.trendingScore).slice(0, 25);
  }

  async rate(rating: ExtensionRating): Promise<void> {
    const ratings = (this.ratings.get(rating.extensionId) ?? []).filter((entry) => entry.userId !== rating.userId);
    ratings.push(rating);
    this.ratings.set(rating.extensionId, ratings);

    const extension = this.extensions.get(rating.extensionId);
    if (extension) {
      const average = ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.length;
      this.extensions.set(extension.id, {
        ...extension,
        rating: Math.round(average * 10) / 10,
        ratingCount: ratings.length,
        updatedAt: new Date().toISOString()
      });
    }
  }

  async ratingsFor(extensionId: string): Promise<ExtensionRating[]> {
    return this.ratings.get(extensionId) ?? [];
  }

  async download(extensionId: string): Promise<ExtensionVersion | null> {
    const extension = this.extensions.get(extensionId);
    const versions = this.versions.get(extensionId) ?? [];
    const latest = versions.at(-1) ?? null;

    if (extension) {
      const downloads = (this.downloads.get(extensionId) ?? extension.downloads) + 1;
      this.downloads.set(extensionId, downloads);
      this.extensions.set(extensionId, {
        ...extension,
        downloads,
        trendingScore: extension.trendingScore + 1,
        updatedAt: new Date().toISOString()
      });
    }

    return latest;
  }

  private compare(left: MarketplaceExtension, right: MarketplaceExtension, sortBy: NonNullable<ExtensionQuery["sortBy"]>, text?: string): number {
    if (sortBy === "downloads") {
      return right.downloads - left.downloads;
    }

    if (sortBy === "rating") {
      return right.rating - left.rating;
    }

    if (sortBy === "trending") {
      return right.trendingScore - left.trendingScore;
    }

    return this.relevance(right, text) - this.relevance(left, text);
  }

  private relevance(extension: MarketplaceExtension, text?: string): number {
    if (!text) {
      return extension.trendingScore + extension.rating * 10 + extension.downloads / 100;
    }

    const haystack = `${extension.displayName} ${extension.name} ${extension.description} ${extension.tags.join(" ")}`.toLowerCase();
    return haystack.includes(text) ? 100 + extension.rating * 10 : extension.rating * 10;
  }
}
