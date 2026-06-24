import express from "express";
import { billingHealthCheck } from "./health-check";
import { handleRevenueCatWebhook } from "./revenuecat/webhook";
import { manualBillingSync } from "./sync/manual-sync";
import { startPeriodicBillingSync } from "./sync/periodic-sync";

export const createBillingServer = () => {
  const app = express();

  app.get("/health", (_request, response) => {
    response.json(billingHealthCheck());
  });

  app.post(
    "/webhooks/revenuecat",
    express.raw({ type: "application/json" }),
    (request, response) => {
      const signature = request.headers["x-revenuecat-signature"] as string | undefined;
      const result = handleRevenueCatWebhook(request.body, signature);
      response.status(result.ok ? 200 : 400).json(result);
    }
  );

  app.post("/api/billing/sync", async (_request, response) => {
    response.json(await manualBillingSync());
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
