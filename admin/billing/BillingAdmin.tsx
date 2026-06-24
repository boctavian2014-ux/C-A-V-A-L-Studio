import { billingHealthCheck } from "../../billing/health-check";
import { listSubscriptions } from "../../billing/revenuecat/update-subscription";

export const BillingAdminPanel = () => (
  <section className="admin-billing-panel">
    <header>
      <h1>Billing Admin</h1>
      <p>RevenueCat subscription overview</p>
    </header>
    <pre>{JSON.stringify(billingHealthCheck(), null, 2)}</pre>
    <h2>Subscriptions</h2>
    <pre>{JSON.stringify(listSubscriptions(), null, 2)}</pre>
  </section>
);
