import cors from "cors";
import express from "express";
import { createAuthRouter } from "./api/auth";
import { createExtensionsRouter } from "./api/extensions";
import { createRatingsRouter } from "./api/ratings";
import { createSearchRouter } from "./api/search";
import { createUsersRouter } from "./api/users";
import { requireAuth } from "./middleware/auth";
import type { MarketplaceRegistry } from "./registry";

const allowedOrigins = (process.env.CAVAL_MARKETPLACE_CORS_ORIGINS
  ?? "http://localhost:8787,http://127.0.0.1:8787,http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const createMarketplaceServer = (registry: MarketplaceRegistry) => {
  const app = express();

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin not allowed"));
    }
  }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "caval-marketplace" });
  });

  app.use("/api/auth", createAuthRouter());
  app.use("/api/extensions", createExtensionsRouter(registry));
  app.use("/api/users", requireAuth, createUsersRouter(registry));
  app.use("/api/ratings", requireAuth, createRatingsRouter(registry));
  app.use("/api/search", createSearchRouter(registry));

  return app;
};
