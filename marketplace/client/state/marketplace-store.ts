import type { MarketplaceExtension } from "../../api";

const STORAGE_KEY = "caval-marketplace-installed";

export interface MarketplaceState {
  query: string;
  selectedCategory?: string;
  extensions: MarketplaceExtension[];
  installedExtensionIds: string[];
  loading: boolean;
}

function readPersistedInstalledIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function persistInstalledIds(ids: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota errors */
  }
}

export class MarketplaceStore {
  private state: MarketplaceState = {
    query: "",
    extensions: [],
    installedExtensionIds: readPersistedInstalledIds(),
    loading: false,
  };

  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  getSnapshot(): MarketplaceState {
    return this.state;
  }

  setState(next: Partial<MarketplaceState>): MarketplaceState {
    this.state = {
      ...this.state,
      ...next,
    };
    this.notify();
    return this.state;
  }

  setInstalledIds(ids: string[]): MarketplaceState {
    const installedExtensionIds = [...new Set(ids.filter(Boolean))];
    persistInstalledIds(installedExtensionIds);
    return this.setState({ installedExtensionIds });
  }

  markInstalled(extensionId: string): MarketplaceState {
    return this.setInstalledIds([...this.state.installedExtensionIds, extensionId]);
  }
}

export const marketplaceStore = new MarketplaceStore();
