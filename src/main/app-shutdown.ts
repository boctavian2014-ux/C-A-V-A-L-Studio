/**
 * Single Electron teardown path for #76.
 * Log `[shutdown] complete` only after every long-lived resource is closed,
 * then allow `app.quit()`.
 */

import type { App } from "electron";

import { parallelScheduler } from "../../ai/context/parallel/parallel-scheduler";
import { closeAllAiPersistence } from "./ai/timeline-persistence";
import { clearAllTurnWatchdogs } from "./ai/turn-watchdog-runtime";
import { stopCadOrphanScan } from "./cad-handlers";
import { stopCadLocalServerAndWait } from "./cad-local-server";
import {
  stopManagedOllamaIfStartedAndWait,
} from "./local-ai-setup";
import { stopMarketplaceServerAndWait } from "./marketplace-server";
import { preloadManager } from "./preload-handlers";
import { shutdownAllPreviewSync } from "./preview/preview-handlers";
import { logRuntimeVersions, shutdownMark } from "./shutdown-diagnostics";
import { shutdownAllTasksSync } from "./tasks-handlers";
import { stopAllInteractiveTerminalsSync } from "./terminal-handlers";
import { withTimeout } from "./wait-for-exit";
import { workspaceIndexService } from "./workspace/workspace-index-service";

const WORKER_STOP_MS = 5_000;

let completed = false;
let inFlight: Promise<void> | null = null;
let quitGate: "idle" | "running" | "ready" = "idle";

export function isAppShutdownComplete(): boolean {
  return completed;
}

export function __resetAppShutdownForTests(): void {
  completed = false;
  inFlight = null;
  quitGate = "idle";
}

async function step(phase: string, fn: () => void | Promise<void>): Promise<void> {
  shutdownMark(phase);
  try {
    await fn();
  } catch (error) {
    shutdownMark(`${phase}-error`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runAppShutdown(reason: string): Promise<void> {
  if (completed) {
    shutdownMark("already-complete", { reason });
    return;
  }
  if (inFlight) {
    shutdownMark("join-in-progress", { reason });
    return inFlight;
  }

  inFlight = (async () => {
    shutdownMark("begin", { reason });

    await step("sqlite-close-all", () => {
      closeAllAiPersistence();
    });
    await step("cad-orphan-timer-clear", () => {
      stopCadOrphanScan();
    });
    await step("turn-watchdog-clear", () => {
      clearAllTurnWatchdogs();
    });
    await step("workspace-index-close", () => workspaceIndexService.close());
    await step("preload-worker-stop", async () => {
      const result = await withTimeout(preloadManager.dispose(), WORKER_STOP_MS);
      if (result === "timeout") {
        shutdownMark("preload-worker-stop-timeout");
      }
    });
    await step("parallel-workers-stop", async () => {
      const result = await withTimeout(parallelScheduler.dispose(), WORKER_STOP_MS);
      if (result === "timeout") {
        shutdownMark("parallel-workers-stop-timeout");
      }
    });
    await step("preview-stop", () => {
      shutdownAllPreviewSync();
    });
    await step("terminals-stop", () => {
      stopAllInteractiveTerminalsSync();
    });
    await step("tasks-stop", () => {
      shutdownAllTasksSync();
    });
    await step("cad-child-stop", () => stopCadLocalServerAndWait());
    await step("marketplace-stop", () => stopMarketplaceServerAndWait());
    await step("ollama-shutdown", () => stopManagedOllamaIfStartedAndWait());

    completed = true;
    shutdownMark("complete");
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function installAppShutdownLifecycle(electronApp: App): void {
  logRuntimeVersions();

  electronApp.on("before-quit", (event) => {
    shutdownMark("before-quit");
    if (quitGate === "ready") {
      return;
    }
    event.preventDefault();
    if (quitGate === "running") {
      return;
    }
    quitGate = "running";
    void runAppShutdown("before-quit")
      .catch((error) => {
        shutdownMark("error", {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        quitGate = "ready";
        electronApp.quit();
      });
  });

  electronApp.on("will-quit", () => {
    shutdownMark("will-quit");
  });

  electronApp.on("quit", () => {
    shutdownMark("quit");
  });
}
