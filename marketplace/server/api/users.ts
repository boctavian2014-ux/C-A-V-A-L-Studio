import { Router } from "express";
import crypto from "node:crypto";
import type { MarketplaceUser } from "../../api";
import type { MarketplaceRegistry } from "../registry";

const users = new Map<string, MarketplaceUser>();
const installedExtensions = new Map<string, string[]>();
const settingsBackups = new Map<string, Record<string, unknown>>();

export const createUsersRouter = (registry: MarketplaceRegistry): Router => {
  const router = Router();

  router.post("/", (request, response) => {
    const now = new Date().toISOString();
    const user: MarketplaceUser = {
      id: crypto.randomUUID(),
      cavalId: String(request.body.cavalId),
      email: String(request.body.email),
      displayName: String(request.body.displayName ?? request.body.email),
      publisherName: request.body.publisherName ? String(request.body.publisherName) : undefined,
      createdAt: now
    };
    users.set(user.id, user);
    response.status(201).json(user);
  });

  router.get("/:userId", (request, response) => {
    const user = users.get(request.params.userId);
    if (!user) {
      response.status(404).json({ error: "User not found." });
      return;
    }

    response.json(user);
  });

  router.get("/:userId/published", async (request, response) => {
    const user = users.get(request.params.userId);
    if (!user?.publisherName) {
      response.json([]);
      return;
    }

    response.json((await registry.search({ limit: 500 })).filter((extension) => extension.publisher === user.publisherName));
  });

  router.put("/:userId/extensions/sync", (request, response) => {
    const extensions = Array.isArray(request.body.extensions) ? request.body.extensions.map(String) : [];
    installedExtensions.set(request.params.userId, extensions);
    response.json({ userId: request.params.userId, extensions, syncedAt: new Date().toISOString() });
  });

  router.get("/:userId/extensions/sync", (request, response) => {
    response.json({
      userId: request.params.userId,
      extensions: installedExtensions.get(request.params.userId) ?? []
    });
  });

  router.put("/:userId/settings/backup", (request, response) => {
    settingsBackups.set(request.params.userId, request.body.settings as Record<string, unknown>);
    response.json({ userId: request.params.userId, backedUpAt: new Date().toISOString() });
  });

  router.get("/:userId/settings/backup", (request, response) => {
    response.json({
      userId: request.params.userId,
      settings: settingsBackups.get(request.params.userId) ?? {}
    });
  });

  return router;
};
