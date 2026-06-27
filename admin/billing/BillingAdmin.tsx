import { useEffect, useState } from "react";
import { billingHealthCheck, type BillingHealthStatus } from "../../billing/health-check";
import type { SubscriptionRecord } from "../../billing/types";

const billingBaseUrl = () =>
  (typeof process !== "undefined" && process.env.BILLING_PUBLIC_URL) || "http://localhost:8790";

async function fetchSubscriptionsViaApi(): Promise<SubscriptionRecord[]> {
  const adminKey =
    typeof process !== "undefined" ? process.env.BILLING_ADMIN_KEY : undefined;
  if (!adminKey) {
    throw new Error("BILLING_ADMIN_KEY not configured for admin panel.");
  }
  const response = await fetch(`${billingBaseUrl()}/api/billing/subscriptions`, {
    headers: { "x-billing-admin-key": adminKey },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  const data = (await response.json()) as { subscriptions?: SubscriptionRecord[] };
  return data.subscriptions ?? [];
}

export const BillingAdminPanel = () => {
  const [health, setHealth] = useState<BillingHealthStatus | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [healthResult, subs] = await Promise.all([
          billingHealthCheck(),
          fetchSubscriptionsViaApi(),
        ]);
        if (!cancelled) {
          setHealth(healthResult);
          setSubscriptions(subs);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="admin-billing-panel">
      <header>
        <h1>Stripe Billing</h1>
        <p>Supabase-backed subscriptions via billing HTTP API (no service role in client)</p>
      </header>
      {error && <p className="admin-billing-error">{error}</p>}
      <h2>Health</h2>
      <pre>{JSON.stringify(health, null, 2)}</pre>
      <h2>Subscriptions ({subscriptions.length})</h2>
      <pre>{JSON.stringify(subscriptions, null, 2)}</pre>
    </section>
  );
};
