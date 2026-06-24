import { MarketplaceRegistry } from "./registry";
import { createMarketplaceServer } from "./server";

export const marketplaceRegistry = new MarketplaceRegistry();

export const seedMarketplace = async (): Promise<void> => {
  await marketplaceRegistry.publish({
    id: "caval.romania-tools",
    publisher: "caval",
    name: "romania-tools",
    version: "0.1.0",
    displayName: "Romania Tools",
    description: "ANAF, eFactura, ONRC si fluxuri educationale pentru dezvoltatori romani.",
    categories: ["Romania", "Productivity", "Business"],
    vscodeCompatible: false,
    cavalVerified: true,
    downloads: 0,
    rating: 5,
    ratingCount: 1,
    trendingScore: 10,
    featured: true,
    tags: ["anaf", "efactura", "onrc", "romania"],
    license: "UNLICENSED",
    latestVersionId: "caval.romania-tools@0.1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await marketplaceRegistry.publishVersion({
    id: "caval.romania-tools@0.1.0",
    extensionId: "caval.romania-tools",
    version: "0.1.0",
    engine: {
      caval: "^0.1.0"
    },
    downloadUrl: "/api/extensions/caval.romania-tools/download",
    changelog: "Initial Caval Romania tooling release.",
    sha256: "seed",
    sizeBytes: 0,
    manifest: {
      name: "romania-tools",
      publisher: "caval",
      engines: {
        caval: "^0.1.0"
      }
    },
    createdAt: new Date().toISOString()
  });
};

export const createServer = () => createMarketplaceServer(marketplaceRegistry);
