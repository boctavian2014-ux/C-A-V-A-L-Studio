import express from "express";
import { billingHealthCheck } from "./health-check";
import { handleRevenueCatWebhook } from "./revenuecat/webhook";
import { manualBillingSync } from "./sync/manual-sync";
import { startPeriodicBillingSync } from "./sync/periodic-sync";
import { handleStripeWebhook } from "./stripe/webhook";
import { createCheckoutSession } from "./stripe/checkout";
import { requireBillingAdmin, requireBillingApiKey } from "./middleware/auth";
import {
  getSubscriptionByCavalId,
  listSubscriptionsFromDb,
} from "./supabase/repository";

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedOrigins = new Set<string>([
      new URL(process.env.BILLING_PUBLIC_URL ?? "http://localhost:8790").origin,
      "http://localhost:8790",
      "https://caval.studio",
    ]);
    return allowedOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}

export const createBillingServer = () => {
  const app = express();

  app.get("/health", async (_request, response) => {
    response.json(await billingHealthCheck());
  });

  app.post(
    "/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (request, response) => {
      const signature = request.headers["stripe-signature"] as string | undefined;
      const result = await handleStripeWebhook(request.body, signature);
      response.status(result.ok ? 200 : 400).json(result);
    }
  );

  if (process.env.ENABLE_REVENUECAT_WEBHOOK === "true") {
    app.post(
      "/webhooks/revenuecat",
      express.raw({ type: "application/json" }),
      (request, response) => {
        const signature = request.headers["x-revenuecat-signature"] as string | undefined;
        const result = handleRevenueCatWebhook(request.body, signature);
        response.status(result.ok ? 200 : 400).json(result);
      }
    );
  }

  app.use(express.json());

  app.post("/api/billing/checkout", requireBillingApiKey, async (request, response) => {
    try {
      const { cavalId, email, successUrl, cancelUrl } = request.body as {
        cavalId?: string;
        email?: string;
        successUrl?: string;
        cancelUrl?: string;
      };
      if (!cavalId || !email) {
        response.status(400).json({ ok: false, error: "cavalId and email required" });
        return;
      }
      const base = process.env.BILLING_PUBLIC_URL ?? "http://localhost:8790";
      const success = successUrl ?? `${base}/checkout/success`;
      const cancel = cancelUrl ?? `${base}/checkout/cancel`;
      if (!isAllowedRedirectUrl(success) || !isAllowedRedirectUrl(cancel)) {
        response.status(400).json({ ok: false, error: "Invalid redirect URL" });
        return;
      }
      const session = await createCheckoutSession({
        cavalId,
        email,
        successUrl: success,
        cancelUrl: cancel,
      });
      response.json({ ok: true, ...session });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ ok: false, error: message });
    }
  });

  app.get("/api/billing/entitlements/:userId", requireBillingApiKey, async (request, response) => {
    try {
      const userId = Array.isArray(request.params.userId)
        ? request.params.userId[0]
        : request.params.userId;
      const sub = await getSubscriptionByCavalId(userId);
      response.json({
        ok: true,
        plan: sub?.plan ?? "community",
        status: sub?.status ?? "unknown",
        entitlements: sub?.entitlements ?? [],
        expiresAt: sub?.expiresAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ ok: false, error: message });
    }
  });

  app.get("/api/billing/subscriptions", requireBillingAdmin, async (_request, response) => {
    try {
      const subs = await listSubscriptionsFromDb();
      response.json({ ok: true, subscriptions: subs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/api/billing/sync", requireBillingAdmin, async (_request, response) => {
    response.json(await manualBillingSync());
  });

  app.get("/checkout/success", (_request, response) => {
    response.type("html").send("<h1>Plată reușită</h1><p>Poți închide această fereastră și reveni în Caval Studio.</p>");
  });

  app.get("/checkout/cancel", (_request, response) => {
    response.type("html").send("<h1>Plată anulată</h1><p>Nu s-a efectuat nicio modificare.</p>");
  });

  return app;
};

export const startBillingServer = (port = Number(process.env.BILLING_PORT ?? 8790)): void => {
  const app = createBillingServer();
  startPeriodicBillingSync();
  app.listen(port, () => {
    console.info(`[billing] listening on :${port}`);
  });
};
