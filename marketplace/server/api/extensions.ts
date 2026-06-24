import { Router } from "express";
import crypto from "node:crypto";
import type { MarketplaceExtension } from "../../api";
import { validateExtensionManifest } from "../../extensions/manifest-validator";
import { requireAuth } from "../middleware/auth";
import { MarketplaceSecurity } from "../utils/security";
import { ExtensionStorage } from "../utils/storage";
import type { MarketplaceRegistry } from "../registry";

export const createExtensionsRouter = (registry: MarketplaceRegistry): Router => {
  const router = Router();
  const security = new MarketplaceSecurity();
  const storage = new ExtensionStorage();

  router.get("/", async (request, response) => {
    response.json(await registry.search({
      category: request.query.category?.toString(),
      sortBy: request.query.sortBy as "relevance" | "downloads" | "rating" | "trending" | undefined,
      limit: Number(request.query.limit ?? 50)
    }));
  });

  router.get("/categories", async (_request, response) => {
    response.json(await registry.listCategories());
  });

  router.get("/trending", async (_request, response) => {
    response.json(await registry.trending());
  });

  router.get("/featured", async (_request, response) => {
    response.json(await registry.featured());
  });

  router.get("/:extensionId", async (request, response) => {
    const extension = await registry.get(request.params.extensionId);
    if (!extension) {
      response.status(404).json({ error: "Extension not found." });
      return;
    }

    response.json({
      ...extension,
      versions: await registry.versionsFor(extension.id)
    });
  });

  router.post("/", requireAuth, async (request, response) => {
    const manifest = request.body.manifest as Record<string, unknown>;
    const validation = validateExtensionManifest(manifest);
    const securityReport = security.scanManifest(manifest);

    if (!validation.valid || !securityReport.safe) {
      response.status(400).json({ validation, securityReport });
      return;
    }

    const now = new Date().toISOString();
    const extension: MarketplaceExtension = {
      id: `${manifest.publisher}.${manifest.name}`,
      publisher: String(manifest.publisher),
      name: String(manifest.name),
      version: String(manifest.version),
      displayName: String(manifest.displayName ?? manifest.name),
      description: String(manifest.description ?? ""),
      categories: Array.isArray(manifest.categories) ? manifest.categories.map(String) : ["Other"],
      vscodeCompatible: Boolean((manifest.engines as { vscode?: string } | undefined)?.vscode),
      cavalVerified: false,
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      trendingScore: 0,
      featured: false,
      tags: Array.isArray(manifest.keywords) ? manifest.keywords.map(String) : [],
      repositoryUrl: typeof manifest.repository === "string" ? manifest.repository : undefined,
      license: typeof manifest.license === "string" ? manifest.license : undefined,
      createdAt: now,
      updatedAt: now
    };

    await registry.publish(extension);
    response.status(201).json(extension);
  });

  router.post("/:extensionId/versions", requireAuth, async (request, response) => {
    const extensionId = String(request.params.extensionId);
    const extension = await registry.get(extensionId);
    if (!extension) {
      response.status(404).json({ error: "Extension not found." });
      return;
    }

    const manifest = request.body.manifest as Record<string, unknown>;
    const payload = JSON.stringify(request.body.package ?? manifest);
    const stored = await storage.savePackage(extensionId, String(manifest.version), Buffer.from(payload));

    const version = {
      id: `${extensionId}@${manifest.version}`,
      extensionId,
      version: String(manifest.version),
      engine: manifest.engines as { vscode?: string; caval?: string },
      downloadUrl: stored.publicUrl,
      changelog: String(request.body.changelog ?? ""),
      sha256: crypto.createHash("sha256").update(payload).digest("hex"),
      sizeBytes: Buffer.byteLength(payload),
      manifest,
      createdAt: new Date().toISOString()
    };

    await registry.publishVersion(version);
    response.status(201).json(version);
  });

  router.get("/:extensionId/download", async (request, response) => {
    const version = await registry.download(request.params.extensionId);
    if (!version) {
      response.status(404).json({ error: "No downloadable version found." });
      return;
    }

    response.json(version);
  });

  return router;
};
