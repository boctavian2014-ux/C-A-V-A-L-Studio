import { Router } from "express";
import crypto from "node:crypto";
import type { ExtensionRating } from "../../api";
import type { MarketplaceRegistry } from "../registry";

export const createRatingsRouter = (registry: MarketplaceRegistry): Router => {
  const router = Router();

  router.get("/:extensionId", async (request, response) => {
    response.json(await registry.ratingsFor(request.params.extensionId));
  });

  router.post("/:extensionId", async (request, response) => {
    const ratingValue = Number(request.body.rating);
    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      response.status(400).json({ error: "rating must be between 1 and 5" });
      return;
    }

    const now = new Date().toISOString();
    const rating: ExtensionRating = {
      id: crypto.randomUUID(),
      extensionId: request.params.extensionId,
      userId: String(request.body.userId),
      rating: ratingValue,
      review: request.body.review ? String(request.body.review) : undefined,
      createdAt: now,
      updatedAt: now
    };

    await registry.rate(rating);
    response.status(201).json(rating);
  });

  return router;
};
