/**
 * Single Electron teardown path for #76.
 * Log `[shutdown] complete` only after every long-lived resource is closed,
 * then allow `app.quit()`.
 */

import type { App } from "electron";

import { closeAllAiPersistence } from "./ai/timeline-persistence";
import { clearAllTurnWatchdogs } from "./ai/turn-watchdog-runtime";
import { stopCadOrphanScan } from "./cad-handlers";
import { stopCadLocalServerAndWait } from "./cad-local-server";
import {
  stopManagedOllamaIfStartedAndWait,
} from "./local-ai-setup";
import { stopMarketplaceServerAndWait } from "./marketplace-server";
import { shutdownAllPreviewSync } from "./preview/preview-handlers";
import { logRuntimeVersions, shutdownMark, shutdownStepError } from "./shutdown-diagnostics";
import { shutdownAllTasksSync } from "./tasks-handlers";
import { stopAllInteractiveTerminalsSync } from "./terminal-handlers";
import { workspaceIndexService } from "./workspace/workspace-index-service";

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
    shutdownStepError(phase, error);
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
    // Do not Worker.terminate() here. CI smoke on Linux (#77) threw Napi::Error
    // after [shutdown] complete when preload/parallel workers were terminated
    // during quit. The process exit path reaps worker_threads.
    shutdownMark("preload-worker-stop", { skipped: "process-exit-reaps" });
    shutdownMark("parallel-workers-stop", { skipped: "process-exit-reaps" });
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

function installProcessExitDiagnostics(): void {
  process.on("exit", (code) => {
    // Cannot be async. Logs the numeric code Electron actually used after [shutdown] quit.
    shutdownMark("process-exit", { code });
  });

  // There was previously no listener. Node/Electron default is: print and exit non-zero.
  // Log first. After [shutdown] complete do not process.exit(1) — that would be a second
  // quit path on top of app.quit(). Before complete, keep the old non-zero exit.
  process.on("uncaughtException", (error) => {
    shutdownStepError("uncaughtException", error);
    if (!completed) {
      process.exit(1);
    }
  });

  process.on("unhandledRejection", (reason) => {
    shutdownStepError("unhandledRejection", reason);
    if (!completed) {
      process.exit(1);
    }
  });
}

export function installAppShutdownLifecycle(electronApp: App): void {
  logRuntimeVersions();
  installProcessExitDiagnostics();

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
        shutdownStepError("runAppShutdown", error);
      })
      .finally(() => {
        quitGate = "ready";
        electronApp.quit();
      });
  });

  electronApp.on("will-quit", () => {
    shutdownMark("will-quit");
  });

  electronApp.on("quit", (_event, exitCode) => {
    shutdownMark("quit", { exitCode });
  });
}
