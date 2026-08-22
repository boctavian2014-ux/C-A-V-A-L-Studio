import http from "node:http";
import https from "node:https";

import {
  DEFAULT_READY_TIMEOUT_MS,
  PREVIEW_HEALTH_CHECK_INTERVAL_MS,
} from "./preview-health-check-config";

export { DEFAULT_READY_TIMEOUT_MS, PREVIEW_HEALTH_CHECK_INTERVAL_MS } from "./preview-health-check-config";

export type PreviewHealthCheckFn = (url: string, signal: AbortSignal) => Promise<boolean>;

function probeOnce(url: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      finish(false);
      return;
    }

    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      parsed,
      { method: "GET", timeout: 4_000 },
      (res) => {
        res.resume();
        finish(res.statusCode != null && res.statusCode < 500);
      }
    );

    const onAbort = () => {
      req.destroy();
      finish(false);
    };

    req.on("timeout", () => {
      req.destroy();
      finish(false);
    });
    req.on("error", () => finish(false));
    signal.addEventListener("abort", onAbort, { once: true });
    req.end();
  });
}

export async function defaultPreviewHealthCheck(
  url: string,
  signal: AbortSignal
): Promise<boolean> {
  return probeOnce(url, signal);
}

export async function waitForPreviewHealthCheck(
  url: string,
  options: {
    healthCheckFn?: PreviewHealthCheckFn;
    timeoutMs?: number;
    intervalMs?: number;
    isCancelled?: () => boolean;
  } = {}
): Promise<boolean> {
  const {
    healthCheckFn = defaultPreviewHealthCheck,
    timeoutMs = DEFAULT_READY_TIMEOUT_MS,
    intervalMs = PREVIEW_HEALTH_CHECK_INTERVAL_MS,
    isCancelled,
  } = options;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isCancelled?.()) return false;
    const controller = new AbortController();
    if (await healthCheckFn(url, controller.signal)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (isCancelled?.()) return false;
  }
  return false;
}
