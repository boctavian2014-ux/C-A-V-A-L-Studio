import fs from "node:fs/promises";
import path from "node:path";
import { MarketplaceSecurity } from "../../marketplace/server/utils/security";
import { validateExtensionManifest } from "../../marketplace/extensions/manifest-validator";

const main = async (): Promise<void> => {
  const extensionRoot = process.env.CAVAL_OFFICIAL_EXTENSIONS_DIR ?? "extensions";
  const marketplaceUrl = process.env.CAVAL_MARKETPLACE_URL ?? "https://marketplace.caval.studio";
  const manifests = await discoverManifests(extensionRoot);
  const security = new MarketplaceSecurity();

  for (const manifestPath of manifests) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const validation = validateExtensionManifest(manifest);
    const report = security.scanManifest(manifest);

    if (!validation.valid || !report.safe) {
      throw new Error(`Marketplace validation failed for ${manifestPath}: ${JSON.stringify({ validation, report }, null, 2)}`);
    }

    if (process.env.PUBLISH_MARKETPLACE === "true") {
      await fetch(`${marketplaceUrl}/api/extensions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.CAVAL_MARKETPLACE_TOKEN ?? ""}`
        },
        body: JSON.stringify({ manifest })
      });
    }

    console.log(`Validated marketplace extension: ${manifestPath}`);
  }
};

const discoverManifests = async (root: string): Promise<string[]> => {
  const entries = await fs.readdir(root, { recursive: true }).catch(() => []);
  return entries
    .map((entry) => path.join(root, entry.toString()))
    .filter((entry) => entry.endsWith("package.json"));
};

void main();
