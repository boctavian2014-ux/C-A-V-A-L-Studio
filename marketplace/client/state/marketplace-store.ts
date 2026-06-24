import type { MarketplaceExtension } from "../../api";

export interface MarketplaceState {
  query: string;
  selectedCategory?: string;
  extensions: MarketplaceExtension[];
  installedExtensionIds: string[];
  loading: boolean;
}

export class MarketplaceStore {
  private state: MarketplaceState = {
    query: "",
    extensions: [],
    installedExtensionIds: [],
    loading: false
  };

  getSnapshot(): MarketplaceState {
    return this.state;
  }

  setState(next: Partial<MarketplaceState>): MarketplaceState {
    this.state = {
      ...this.state,
      ...next
    };
    return this.state;
  }

  markInstalled(extensionId: string): MarketplaceState {
    return this.setState({
      installedExtensionIds: [...new Set([...this.state.installedExtensionIds, extensionId])]
    });
  }
}

export const marketplaceStore = new MarketplaceStore();
