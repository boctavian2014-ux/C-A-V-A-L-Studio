import { useTranslation } from "../../../ai/i18n/useTranslation";
import type { MarketplaceExtension } from "../../api";

export interface ExtensionCardProps {
  extension: MarketplaceExtension;
  installed?: boolean;
  installing?: boolean;
  onSelect?: (extension: MarketplaceExtension) => void;
  onInstall?: (extension: MarketplaceExtension) => void;
}

export const ExtensionCard = ({
  extension,
  installed = false,
  installing = false,
  onSelect,
  onInstall,
}: ExtensionCardProps) => {
  const { t } = useTranslation();
  return (
    <article className="extension-card" onClick={() => onSelect?.(extension)}>
      <div className="extension-card__icon">
        {extension.iconUrl ? (
          <img src={extension.iconUrl} alt="" width={36} height={36} style={{ borderRadius: 8, objectFit: "cover" }} />
        ) : (
          extension.displayName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="extension-card__body">
        <h3>{extension.displayName}</h3>
        <p>{extension.description}</p>
        <footer>
          <span>{extension.publisher}</span>
          {extension.ratingCount > 0 && (
            <span>{t("marketplace.stars", { rating: extension.rating.toFixed(1) })}</span>
          )}
          {extension.downloads > 0 && (
            <span>{t("marketplace.downloads", { count: extension.downloads.toLocaleString() })}</span>
          )}
        </footer>
      </div>
      <button
        type="button"
        disabled={installing || installed}
        onClick={(event) => {
          event.stopPropagation();
          onInstall?.(extension);
        }}
      >
        {installed
          ? t("marketplace.installedBadge")
          : installing
            ? t("marketplace.installing")
            : t("marketplace.install")}
      </button>
    </article>
  );
};
