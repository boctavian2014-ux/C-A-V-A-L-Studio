import { useState } from "react";
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
}

export const MarketplacePanel = ({ baseUrl, categories, featured }: MarketplacePanelProps) => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const { extensions, loading, error } = useExtensions(baseUrl, category);
  const { results, suggestions } = useSearch(baseUrl, query);
  const visibleExtensions = query.trim() ? results : extensions;
  const installed = marketplaceStore.getSnapshot().installedExtensionIds;

  const install = (extension: MarketplaceExtension) => {
    marketplaceStore.markInstalled(extension.id);
  };

  return (
    <section className="marketplace-panel">
      <header>
        <p className="eyebrow">Caval Marketplace</p>
        <h1>Extensions, plugins, themes and AI tools</h1>
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
        <div className="extension-grid">
          {visibleExtensions.map((extension) => (
            <ExtensionCard key={extension.id} extension={extension} installed={installed.includes(extension.id)} onInstall={install} />
          ))}
        </div>
      </section>
    </section>
  );
};
