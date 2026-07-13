import { useState, useSyncExternalStore } from "react";
import type { MarketplaceExtension } from "../../api";
import { useExtensions } from "../hooks/useExtensions";
import { useSearch } from "../hooks/useSearch";
import { marketplaceStore } from "../state/marketplace-store";
import { ExtensionCard } from "./extension-card";
import { SearchBar } from "./search-bar";

export interface MarketplacePanelProps {
  baseUrl: string;
  categories: string[];
  featured: MarketplaceExtension[];
  marketplaceOnlineHint?: string;
  onInstall?: (extension: MarketplaceExtension) => Promise<{ ok: boolean; error?: string }>;
}

export const MarketplacePanel = ({
  baseUrl,
  categories,
  featured,
  marketplaceOnlineHint,
  onInstall,
}: MarketplacePanelProps) => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [installError, setInstallError] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const { extensions, loading, error } = useExtensions(baseUrl, category);
  const { results, suggestions } = useSearch(baseUrl, query);
  const visibleExtensions = query.trim() ? results : extensions;
  const installed = useSyncExternalStore(
    (onStoreChange) => marketplaceStore.subscribe(onStoreChange),
    () => marketplaceStore.getSnapshot().installedExtensionIds,
    () => marketplaceStore.getSnapshot().installedExtensionIds
  );

  const install = async (extension: MarketplaceExtension) => {
    setInstallError(null);
    if (!baseUrl.trim()) {
      setInstallError("Marketplace URL lipsă — configurează CAVAL_MARKETPLACE_URL.");
      return;
    }
    setInstallingId(extension.id);
    try {
      if (onInstall) {
        const res = await onInstall(extension);
        if (!res.ok) {
          setInstallError(res.error ?? "Instalare eșuată.");
          return;
        }
      }
      marketplaceStore.markInstalled(extension.id);
    } catch (cause: unknown) {
      setInstallError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <section className="marketplace-panel">
      <header>
        <p className="eyebrow">Caval Marketplace</p>
        <h1>Extensions, plugins, themes and AI tools</h1>
        {marketplaceOnlineHint && <p className="marketplace-hint">{marketplaceOnlineHint}</p>}
        <SearchBar query={query} suggestions={suggestions} onChange={setQuery} />
      </header>

      <nav className="marketplace-categories" aria-label="Marketplace categories">
        <button type="button" onClick={() => setCategory(undefined)}>All</button>
        {categories.map((item) => (
          <button key={item} type="button" onClick={() => setCategory(item)}>{item}</button>
        ))}
      </nav>

      {featured.length > 0 && (
        <section>
          <h2>Featured</h2>
          <div className="extension-grid">
            {featured.map((extension) => (
              <ExtensionCard key={extension.id} extension={extension} installed={installed.includes(extension.id)} onInstall={install} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>{query ? "Search results" : "Trending"}</h2>
        {loading && <p>Loading marketplace...</p>}
        {error && <p role="alert">{error}</p>}
        {installError && <p role="alert">{installError}</p>}
        <div className="extension-grid">
          {visibleExtensions.map((extension) => (
            <ExtensionCard
              key={extension.id}
              extension={extension}
              installed={installed.includes(extension.id)}
              onInstall={install}
              installing={installingId === extension.id}
            />
          ))}
        </div>
      </section>
    </section>
  );
};
