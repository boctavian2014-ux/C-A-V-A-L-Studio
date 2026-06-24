export interface MarketplaceExtension {
  id: string;
  publisher: string;
  name: string;
  version: string;
  displayName: string;
  description: string;
  categories: string[];
  vscodeCompatible: boolean;
  cavalVerified: boolean;
  downloads: number;
  rating: number;
  ratingCount: number;
  trendingScore: number;
  featured: boolean;
  tags: string[];
  repositoryUrl?: string;
  license?: string;
  iconUrl?: string;
  latestVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionVersion {
  id: string;
  extensionId: string;
  version: string;
  engine: {
    vscode?: string;
    caval?: string;
  };
  downloadUrl: string;
  changelog: string;
  sha256: string;
  sizeBytes: number;
  manifest: Record<string, unknown>;
  createdAt: string;
}

export interface MarketplaceUser {
  id: string;
  cavalId: string;
  email: string;
  displayName: string;
  publisherName?: string;
  createdAt: string;
}

export interface ExtensionRating {
  id: string;
  extensionId: string;
  userId: string;
  rating: number;
  review?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionQuery {
  text?: string;
  category?: string;
  verifiedOnly?: boolean;
  sortBy?: "relevance" | "downloads" | "rating" | "trending";
  limit?: number;
}

export interface MarketplaceApi {
  search(query: ExtensionQuery): Promise<MarketplaceExtension[]>;
  get(extensionId: string): Promise<MarketplaceExtension | null>;
  publish(extension: MarketplaceExtension): Promise<void>;
  listCategories(): Promise<string[]>;
  rate(rating: ExtensionRating): Promise<void>;
  download(extensionId: string): Promise<ExtensionVersion | null>;
}
