/**
 * Isolated NVIDIA mid-stream quit gate (#77). Env-gated; no-op in normal sessions.
 */

import type { App, BrowserWindow } from "electron";

export function isNvidiaMidstreamQuitGate(): boolean {
  return process.env.CAVAL_NVIDIA_MIDSTREAM_QUIT === "1";
}

function quitOnce(
  window: BrowserWindow,
  app: App,
  mode: string,
  fired: { current: boolean }
): void {
  if (fired.current) return;
  fired.current = true;
  console.info(`[nvidia-gate] quit mode=${mode}`);
  if (mode === "window.close") {
    if (!window.isDestroyed()) window.close();
    return;
  }
  if (mode === "app.quit") {
    app.quit();
  }
}

export function armNvidiaMidstreamQuitGate(
  window: BrowserWindow,
  app: App,
  bindWorkspace: (senderId: number, folderPath: string) => void
): void {
  if (!isNvidiaMidstreamQuitGate()) return;

  const workspace = process.env.CAVAL_GATE_WORKSPACE?.trim();
  if (workspace) {
    bindWorkspace(window.webContents.id, workspace);
    console.info("[nvidia-gate] workspace-bound");
  }

  const quitMode = (process.env.CAVAL_GATE_QUIT_MODE ?? "none").trim();
  const quitWhen = (process.env.CAVAL_GATE_QUIT_WHEN ?? "none").trim();
  const quitMs = Number.parseInt(process.env.CAVAL_GATE_QUIT_MS ?? "0", 10) || 0;
  const nearEndChars = Number.parseInt(process.env.CAVAL_GATE_NEAR_END_CHARS ?? "4000", 10) || 4000;
  const fired = { current: false };
  let firstChunkAt = 0;

  window.webContents.on("console-message", (_event, _level, message) => {
    const text = String(message);
    if (text.includes("[nvidia-gate] first-chunk") && firstChunkAt === 0) {
      firstChunkAt = Date.now();
      if (quitWhen === "delay" && quitMs > 0) {
        setTimeout(() => quitOnce(window, app, quitMode, fired), quitMs);
      }
      if (quitWhen === "first-chunk") {
        quitOnce(window, app, quitMode, fired);
      }
      if (quitWhen === "near-end") {
        setTimeout(() => quitOnce(window, app, quitMode, fired), 12_000);
      }
    }
    if (quitWhen === "near-end") {
      const charsMatch = text.match(/\[nvidia-gate\] chars=(\d+)/);
      if (charsMatch) {
        const chars = Number.parseInt(charsMatch[1] ?? "0", 10);
        if (chars >= nearEndChars) {
          quitOnce(window, app, quitMode, fired);
        }
      }
    }
    if (text.includes("[nvidia-gate] stream-done") || text.includes("[nvidia-gate] stream-error")) {
      setTimeout(() => quitOnce(window, app, quitMode, fired), 400);
    }
  });

  const model = "nvidia-nemotron-3-nano";
  console.info("[nvidia-gate] requested-model " + model);
  const prompt =
    process.env.CAVAL_GATE_PROMPT?.trim() ||
    "Explică în detaliu arhitectura unui sistem de recomandări. Include: ingestie, feature store, candidate generation, ranking, re-ranking, feedback loop, evaluare offline/online, serving, failover, și exemple concrete de componente. Scrie un text lung, structurat, peste 2000 de tokeni.";

  const script = `(async () => {
    const caval = window.caval;
    if (!caval) {
      console.error("[nvidia-gate] missing window.caval");
      return;
    }
    const avail = await caval.getAgenticAvailability();
    console.info("[nvidia-gate] availability " + JSON.stringify(avail));
    const secrets = await caval.secretsGet();
    const nvidiaConfigured = Boolean(secrets && secrets.configured && secrets.configured.NVIDIA_API_KEY);
    console.info("[nvidia-gate] nvidia-configured " + nvidiaConfigured);
    let probe = { ok: false, result: "skipped" };
    if (typeof caval.testProviderKey === "function") {
      probe = await caval.testProviderKey({ providerId: "nvidia" });
    }
    console.info("[nvidia-gate] nvidia-probe " + JSON.stringify({ ok: probe.ok, result: probe.result }));
    if (!avail || avail.available !== true || !nvidiaConfigured || probe.result !== "valid") {
      console.error("[nvidia-gate] nvidia-unavailable");
      return;
    }
    const streamId = "nvidia-gate-" + Date.now();
    let chars = 0;
    let first = false;
    caval.chatStream({
      message: ${JSON.stringify(prompt)},
      model: ${JSON.stringify(model)},
      mode: "ask",
      streamId: streamId,
      maxTokens: 4096,
      skipMultiAgent: true,
      workspaceRoot: ${JSON.stringify(workspace ?? "")},
    }, (chunk) => {
      if (!chunk) return;
      console.info("[nvidia-gate] chunk-type " + chunk.type);
      if (chunk.type === "meta") {
        console.info("[nvidia-gate] meta " + String(chunk.resolvedModel || "") + " " + String(chunk.reason || ""));
      }
      if (chunk.type === "error") {
        console.error("[nvidia-gate] stream-error " + String(chunk.error || chunk.code || ""));
      }
      const piece = String(chunk.delta || chunk.reasoningDelta || "");
      if ((chunk.type === "delta" || chunk.type === "reasoning") && piece) {
        chars += piece.length;
        if (!first) {
          first = true;
          console.info("[nvidia-gate] first-chunk type=" + chunk.type);
        }
        console.info("[nvidia-gate] chars=" + chars);
      }
      if (chunk.type === "done") {
        console.info("[nvidia-gate] stream-done");
      }
    });
    console.info("[nvidia-gate] stream-started " + streamId);
  })()`;

  setTimeout(() => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    void window.webContents.executeJavaScript(script).catch((error: unknown) => {
      console.error(
        "[nvidia-gate] executeJavaScript failed",
        error instanceof Error ? error.message : String(error)
      );
    });
  }, 400);
}
