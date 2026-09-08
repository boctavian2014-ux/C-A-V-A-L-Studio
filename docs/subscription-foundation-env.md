# Subscription foundation — managed provider env (Railway)

These keys stay **server-side only** (Railway / KMS). Never paste into the Electron
renderer UI. Presence may be reported as booleans; values must not appear in IPC,
logs, or API responses.

Required for OpenAI / Anthropic managed routing (same vault model as existing providers):

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

Already used by Caval (keep on Railway as today):

- `OPENROUTER_API_KEY`
- `NVIDIA_API_KEY`
- `ZOO_API_TOKEN`
- `PIAPI_API_KEY`
- `MESHY_API_KEY`
- `STEPFUN_API_KEY` (if used)

Revolut manual monthly plan (Payment Links — not automatic recurring billing):

- `REVOLUT_PAYMENT_LINK_PRO` — https URL on `checkout.revolut.com` / `pay.revolut.com`
- `REVOLUT_PAYMENT_LINK_ULTRA`

Billing auth (server only):

- `BILLING_API_KEY` — Electron / client calls (`x-billing-api-key`)
- `BILLING_ADMIN_KEY` — activate / admin (`x-billing-admin-key`)

**Security:** keep both keys in local shell env or CI secrets only — never commit them,
never paste into chat logs, and do not enable request-header echoing in Railway access
logs. Auth middleware returns only `Unauthorized` / `not configured`; responses never
include the provided key.

Optional plan limit overrides (development fixtures, not launch pricing):

- `PLAN_FREE_CHAT_TOKENS`, `PLAN_FREE_CAD_JOBS`, `PLAN_FREE_ZOO_BUDGET_USD`, `PLAN_FREE_ALLOWED_TIERS`
- `PLAN_PRO_*`, `PLAN_ULTRA_*` equivalents

## Manual billing runbook (until webhook)

### Access control

| Capability | Who |
|---|---|
| `BILLING_API_KEY` / upgrade-link GET | service + trusted ops only |
| `BILLING_ADMIN_KEY` / `subscriptions:activate` | **admin/ops only** — not all collaborators |
| Revolut Business payment dashboard | admin/ops who verify payments |

### Production checklist

1. Create Revolut Business Payment Links (Pro monthly, Ultra monthly).
2. Set `REVOLUT_PAYMENT_LINK_PRO` + `REVOLUT_PAYMENT_LINK_ULTRA` on Railway.
3. Verify (key only in your local shell, not in persistent history if avoidable):

```bash
curl -sS -H "x-billing-api-key: $BILLING_API_KEY" \
  "$BILLING_BASE/api/subscriptions/upgrade-link/pro"
```

Expected: `{ "ok": true, "plan": "pro", "url": "https://..." }` (same for `/ultra`).

4. Electron CTA: Settings → Plan → Upgrade → external browser on Revolut host; no secrets in IPC/logs.
5. E2E: Free → pay → admin activates with Revolut reference → refetch → Pro/Ultra active.

### Activate after payment

```bash
npm run subscriptions:activate -- --userId=caval_xxx --plan=pro --ref=rv_pay_ref
```

`--ref` maps to `revolutPaymentReference` (Revolut payment / order id from the dashboard).

**Idempotency:** a second activate with the **same** `userId` + `plan` + `--ref` returns the
existing active period and does **not** reset `currentPeriodStart` / `currentPeriodEnd`.
The same `--ref` cannot be reused for a different `userId`. Same `--ref` with a **different
plan** for the same user is rejected (operator mismatch — do not upgrade Pro→Ultra on a Pro payment ref).

### Payment ↔ user mismatch

If the Revolut payer email does not match the Caval account:

1. Do **not** activate on guesswork.
2. Ops reconciles manually (support ticket / chat proof + Revolut receipt).
3. Activate only after `userId` is confirmed; store the Revolut reference in `--ref`.

### Refund / chargeback (manual period, pre-webhook)

Until `feat/revolut-payment-webhook`:

1. Ops confirms refund/chargeback in Revolut.
2. Manually set subscription `status` to `canceled` (or re-activate Free by clearing active period via admin path when available).
3. Record the Revolut reference + reason in the billing audit note (ops doc / ticket).
4. User loses Pro/Ultra entitlements on next `subscriptionsMe` / entitlement check.

Webhook PR will automate activate / renew / cancel with signature verification and
dedupe on `revolutPaymentReference`.
