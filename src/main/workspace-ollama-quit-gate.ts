/**
 * Isolated workspace + Ollama quit gate (#77). Env-gated; no-op in normal sessions.
 * Does not set CAVAL_SMOKE — smoke boot skips ensureOllamaOnBoot().
 */

import type { App, BrowserWindow } from "electron";

import { isOllamaReachable } from "../../ai/models/ollama-client";

export function isWorkspaceOllamaQuitGate(): boolean {
  return process.env.CAVAL_WORKSPACE_OLLAMA_QUIT === "1";
}

export function armWorkspaceOllamaQuitGate(
  window: BrowserWindow,
  app: App,
  bindWorkspace: (senderId: number, folderPath: string) => void
): void {
  if (!isWorkspaceOllamaQuitGate()) return;

  const workspace = process.env.CAVAL_GATE_WORKSPACE?.trim();
  if (workspace) {
    bindWorkspace(window.webContents.id, workspace);
    console.info("[ollama-gate] workspace-bound");
  } else {
    console.error("[ollama-gate] missing-workspace");
    return;
  }

  const quitMs = Number.parseInt(process.env.CAVAL_GATE_QUIT_MS ?? "500", 10) || 500;
  const timeoutMs = Number.parseInt(process.env.CAVAL_GATE_TIMEOUT_MS ?? "60000", 10) || 60_000;
  const started = Date.now();
  const fired = { current: false };

  const quitOnce = (): void => {
    if (fired.current) return;
    fired.current = true;
    console.info("[ollama-gate] quit");
    app.quit();
  };

  const poll = setInterval(() => {
    void (async () => {
      if (fired.current) {
        clearInterval(poll);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        console.error("[ollama-gate] ollama-unavailable");
        clearInterval(poll);
        quitOnce();
        return;
      }
      try {
        const ok = await isOllamaReachable({ force: true });
        if (!ok) return;
        console.info("[ollama-gate] ollama-ready");
        clearInterval(poll);
        setTimeout(quitOnce, quitMs);
      } catch {
        /* keep polling */
      }
    })();
  }, 250);
}
