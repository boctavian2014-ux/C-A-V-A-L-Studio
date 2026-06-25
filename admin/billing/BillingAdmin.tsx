import { useEffect, useState } from "react";
import { billingHealthCheck, type BillingHealthStatus } from "../../billing/health-check";
import { listSubscriptionsFromDb } from "../../billing/supabase/repository";
import type { SubscriptionRecord } from "../../billing/types";

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
          listSubscriptionsFromDb(),
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
        <p>Supabase-backed subscriptions and Stripe webhook health</p>
      </header>
      {error && <p className="admin-billing-error">{error}</p>}
      <h2>Health</h2>
      <pre>{JSON.stringify(health, null, 2)}</pre>
      <h2>Subscriptions ({subscriptions.length})</h2>
      <pre>{JSON.stringify(subscriptions, null, 2)}</pre>
    </section>
  );
};
