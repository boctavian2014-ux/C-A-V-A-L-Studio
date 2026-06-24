import { BillingAdminPanel } from "../billing/BillingAdmin";

export const AdminDashboardApp = () => (
  <main className="admin-dashboard">
    <header>
      <h1>Caval Admin</h1>
      <nav>
        <a href="#billing">Billing</a>
        <a href="#reliability">Reliability</a>
        <a href="#ai-center">AI Center</a>
      </nav>
    </header>
    <section id="billing">
      <BillingAdminPanel />
    </section>
    <section id="reliability">
      <h2>Reliability Pack</h2>
      <p>Health checks and incident timeline placeholder.</p>
    </section>
    <section id="ai-center">
      <h2>AI Center</h2>
      <p>Agent usage and model routing metrics placeholder.</p>
    </section>
  </main>
);
