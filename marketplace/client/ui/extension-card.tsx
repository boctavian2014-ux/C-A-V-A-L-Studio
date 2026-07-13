import type { MarketplaceExtension } from "../../api";

export interface ExtensionCardProps {
  extension: MarketplaceExtension;
  installed?: boolean;
  installing?: boolean;
  onSelect?: (extension: MarketplaceExtension) => void;
  onInstall?: (extension: MarketplaceExtension) => void;
}

export const ExtensionCard = ({ extension, installed = false, installing = false, onSelect, onInstall }: ExtensionCardProps) => (
  <article className="extension-card" onClick={() => onSelect?.(extension)}>
    <div className="extension-card__icon">
      {extension.iconUrl ? (
        <img src={extension.iconUrl} alt="" width={36} height={36} style={{ borderRadius: 8, objectFit: 'cover' }} />
      ) : (
        extension.displayName.slice(0, 1).toUpperCase()
      )}
    </div>
    <div className="extension-card__body">
      <h3>{extension.displayName}</h3>
      <p>{extension.description}</p>
      <footer>
        <span>{extension.publisher}</span>
        {extension.ratingCount > 0 && <span>{extension.rating.toFixed(1)} stars</span>}
        {extension.downloads > 0 && <span>{extension.downloads.toLocaleString()} downloads</span>}
      </footer>
    </div>
    <button type="button" disabled={installing || installed} onClick={(event) => {
      event.stopPropagation();
      onInstall?.(extension);
    }}>
      {installed ? "Installed" : installing ? "Installing…" : "Install"}
    </button>
  </article>
);
