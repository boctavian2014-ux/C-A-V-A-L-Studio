import { getModelProfile } from "../model-profiles";

const WARM_INTERVAL_MS = 5 * 60_000;
let lastWarmAt = 0;

/** Keep TLS + OpenRouter route hot — abort after first stream byte. */
export function warmOpenRouterConnection(force = false, modelId = 'stepfun-step-3-7-flash'): void {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return;

  const now = Date.now();
  if (!force && now - lastWarmAt < WARM_INTERVAL_MS) return;
  lastWarmAt = now;

  const profile = getModelProfile(modelId);
  const model = profile?.providerModelId ?? (modelId.includes('/') ? modelId : 'stepfun/step-3.7-flash');

  void (async () => {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "HTTP-Referer": "https://caval.studio",
          "X-Title": "CAVALLO Studio",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          stream: true,
          max_tokens: 1,
          temperature: 0,
          provider: { sort: "latency" },
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      await reader.read();
      await reader.cancel().catch(() => undefined);
    } catch {
      // warm is best-effort
    }
  })();
}
