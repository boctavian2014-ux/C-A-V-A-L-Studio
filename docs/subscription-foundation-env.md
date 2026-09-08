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

- `REVOLUT_PAYMENT_LINK_PRO` — https URL on checkout.revolut.com / pay.revolut.com
- `REVOLUT_PAYMENT_LINK_ULTRA`

Optional plan limit overrides (development fixtures, not launch pricing):

- `PLAN_FREE_CHAT_TOKENS`, `PLAN_FREE_CAD_JOBS`, `PLAN_FREE_ZOO_BUDGET_USD`, `PLAN_FREE_ALLOWED_TIERS`
- `PLAN_PRO_*`, `PLAN_ULTRA_*` equivalents

Activate after a manual payment:

```bash
npm run subscriptions:activate -- --userId=caval_xxx --plan=pro --ref=rv_pay_ref
```
