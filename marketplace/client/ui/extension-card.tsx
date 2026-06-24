import type { MarketplaceExtension } from "../../api";

export interface ExtensionCardProps {
  extension: MarketplaceExtension;
  installed?: boolean;
  onSelect?: (extension: MarketplaceExtension) => void;
  onInstall?: (extension: MarketplaceExtension) => void;
}

export const ExtensionCard = ({ extension, installed = false, onSelect, onInstall }: ExtensionCardProps) => (
  <article className="extension-card" onClick={() => onSelect?.(extension)}>
    <div className="extension-card__icon">{extension.displayName.slice(0, 1).toUpperCase()}</div>
    <div className="extension-card__body">
      <h3>{extension.displayName}</h3>
      <p>{extension.description}</p>
      <footer>
        <span>{extension.publisher}</span>
        <span>{extension.rating.toFixed(1)} stars</span>
        <span>{extension.downloads.toLocaleString()} downloads</span>
      </footer>
    </div>
    <button type="button" onClick={(event) => {
      event.stopPropagation();
      onInstall?.(extension);
    }}>
      {installed ? "Installed" : "Install"}
    </button>
  </article>
);
