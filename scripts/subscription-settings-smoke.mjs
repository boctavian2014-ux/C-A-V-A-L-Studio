/**
 * Isolated smoke helper for subscription foundation (not CAD/Robotics).
 * Run with Electron CDP after `npm run build` in this worktree.
 *
 * Usage (after Electron with --remote-debugging-port=9360):
 *   node scripts/subscription-settings-smoke.mjs
 */
import { setTimeout as delay } from "node:timers/promises";

const CDP_HTTP = process.env.SUBSCRIPTION_CDP_HTTP ?? "http://127.0.0.1:9360";

async function cdpPage() {
  const list = await fetch(`${CDP_HTTP}/json/list`).then((r) => r.json());
  const page = list.find(
    (t) => t.type === "page" && /index\.html/i.test(String(t.url || ""))
  );
  if (!page?.webSocketDebuggerUrl) throw new Error(`no caval page on ${CDP_HTTP}`);
  return page;
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const nid = ++id;
      pending.set(nid, { resolve, reject });
      ws.send(JSON.stringify({ id: nid, method, params }));
    });
  return {
    ws,
    send,
    ready: new Promise((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", reject);
    }),
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        JSON.stringify(result.exceptionDetails)
    );
  }
  return result.result?.value;
}

const page = await cdpPage();
const cdp = connect(page.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send("Runtime.enable");

const opened = await evaluate(
  cdp,
  `(() => {
    const btn = document.querySelector('[data-testid="activity-settings"], [aria-label*="Settings"], button');
    // Prefer settings via store if exposed; else click nav when SettingsPanel open.
    return Boolean(window.caval?.subscriptionsMe);
  })()`
);

const me = await evaluate(cdp, `window.caval.subscriptionsMe()`);
console.log("subscriptionsMe", JSON.stringify(me, null, 2));

if (!me?.ok || me.subscription?.plan !== "free") {
  console.error("SMOKE_FAIL expected free plan");
  process.exit(1);
}
if (me.usage?.chatTokensUsed !== 0) {
  console.error("SMOKE_FAIL expected zero usage");
  process.exit(1);
}
if (Array.isArray(me.modelUsage) && me.modelUsage.length !== 0) {
  console.error("SMOKE_FAIL modelUsage must be empty in PR1");
  process.exit(1);
}

const secretLeak = JSON.stringify(me);
if (/sk-|sk-ant-|nvapi-/i.test(secretLeak)) {
  console.error("SMOKE_FAIL secret-looking value in subscriptionsMe payload");
  process.exit(1);
}

// Upgrade link: only assert IPC shape when env is configured; otherwise expect structured error.
const upgrade = await evaluate(
  cdp,
  `window.caval.subscriptionsOpenUpgrade({ plan: "pro" })`
);
console.log("subscriptionsOpenUpgrade", JSON.stringify(upgrade));
if (!upgrade || typeof upgrade.ok !== "boolean") {
  console.error("SMOKE_FAIL upgrade IPC missing");
  process.exit(1);
}
if (upgrade.ok && upgrade.url && /token=|api_key=/i.test(upgrade.url)) {
  console.error("SMOKE_FAIL upgrade URL must be redacted / free of secrets");
  process.exit(1);
}

console.log("SMOKE_PASS subscription foundation", { apiPresent: opened });
cdp.ws.close();
await delay(100);
process.exit(0);
