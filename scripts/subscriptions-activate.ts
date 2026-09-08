/**
 * Admin CLI: activate a monthly plan after manual Revolut payment.
 *
 * Usage:
 *   npm run subscriptions:activate -- --userId=caval_xxx --plan=pro
 *   npm run subscriptions:activate -- --userId=caval_xxx --plan=ultra --ref=rv_pay_123
 */

import {
  activatePlan,
  getSubscriptionSummary,
  isUpgradePlanTarget,
} from "../billing/subscriptions/service";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq === -1) {
      out[arg.slice(2)] = "true";
    } else {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const userId = args.userId?.trim();
  const plan = args.plan?.trim();
  const ref = args.ref?.trim() || args.revolutPaymentReference?.trim();

  if (!userId) {
    console.error("Missing --userId=...");
    process.exit(1);
  }
  if (!isUpgradePlanTarget(plan)) {
    console.error("Missing or invalid --plan=pro|ultra");
    process.exit(1);
  }

  try {
    const record = activatePlan({
      userId,
      plan,
      revolutPaymentReference: ref,
    });
    const summary = getSubscriptionSummary(userId);
    console.log(
      JSON.stringify(
        {
          ok: true,
          activated: {
            userId: record.userId,
            plan: record.plan,
            status: record.status,
            currentPeriodStart: record.currentPeriodStart,
            currentPeriodEnd: record.currentPeriodEnd,
            billingMode: record.billingMode,
            revolutPaymentReference: record.revolutPaymentReference ?? null,
          },
          summary,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    process.exit(1);
  }
}

main();
