import { useState } from "react";

import type { MarketplaceExtension } from "../../api";
import { useOpenVsxSearch } from "../hooks/useOpenVsxSearch";
import { marketplaceStore } from "../state/marketplace-store";
import { ExtensionCard } from "./extension-card";
import { SearchBar } from "./search-bar";

export interface VsCodeExtensionsPanelProps {
  onInstall?: (extension: MarketplaceExtension) => Promise<{ ok: boolean; error?: string }>;
  installedIds?: string[];
  isInstalled?: (extension: MarketplaceExtension) => boolean;
}

export const VsCodeExtensionsPanel = ({ onInstall, installedIds = [], isInstalled }: VsCodeExtensionsPanelProps) => {
  const [query, setQuery] = useState("");
  const [installError, setInstallError] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const { extensions, loading, error, isPopular } = useOpenVsxSearch(query);

  const install = async (extension: MarketplaceExtension) => {
    setInstallError(null);
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

  const checkInstalled = (extension: MarketplaceExtension) =>
    isInstalled?.(extension) ?? installedIds.includes(extension.id);

  return (
    <section className="marketplace-panel">
      <header>
        <p className="eyebrow">Open VSX</p>
        <h1>Extensii</h1>
        <SearchBar
          query={query}
          suggestions={[]}
          onChange={setQuery}
        />
      </header>

      <section>
        <h2>{isPopular ? "Populare" : "Rezultate"}</h2>
        {loading && <p>{isPopular ? "Se încarcă extensiile populare…" : "Se caută…"}</p>}
        {error && <p role="alert">{error}</p>}
        {installError && <p role="alert">{installError}</p>}
        <div className="extension-grid">
          {extensions.map((extension) => (
            <ExtensionCard
              key={extension.id}
              extension={extension}
              installed={checkInstalled(extension)}
              installing={installingId === extension.id}
              onInstall={install}
            />
          ))}
        </div>
        {!loading && extensions.length === 0 && !error && (
          <p className="marketplace-hint">
            {isPopular ? "Nicio extensie populară disponibilă." : "Nicio extensie găsită."}
          </p>
        )}
      </section>
    </section>
  );
};
