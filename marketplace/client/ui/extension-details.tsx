import type { ExtensionVersion, MarketplaceExtension } from "../../api";

export interface ExtensionDetailsProps {
  extension: MarketplaceExtension;
  versions: ExtensionVersion[];
  onInstall?: (extension: MarketplaceExtension) => void;
}

export const ExtensionDetails = ({ extension, versions, onInstall }: ExtensionDetailsProps) => (
  <section className="extension-details">
    <header>
      <h2>{extension.displayName}</h2>
      <p>{extension.description}</p>
      <button type="button" onClick={() => onInstall?.(extension)}>Install</button>
    </header>
    <dl>
      <dt>Publisher</dt>
      <dd>{extension.publisher}</dd>
      <dt>Rating</dt>
      <dd>{extension.rating.toFixed(1)} from {extension.ratingCount} reviews</dd>
      <dt>Downloads</dt>
      <dd>{extension.downloads.toLocaleString()}</dd>
      <dt>Compatibility</dt>
      <dd>{extension.vscodeCompatible ? "VS Code compatible" : "Caval native"}</dd>
    </dl>
    <h3>Versions</h3>
    <ol>
      {versions.map((version) => (
        <li key={version.id}>
          <strong>{version.version}</strong>
          <p>{version.changelog}</p>
        </li>
      ))}
    </ol>
  </section>
);
