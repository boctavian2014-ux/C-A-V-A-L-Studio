/**
 * Timestamped shutdown markers for #76 (Windows STATUS_STACK_BUFFER_OVERRUN).
 * JS logs cannot name the native module; they only order teardown.
 */

export function shutdownMark(phase: string, extra?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  console.info(`[shutdown] ${ts} ${phase}${suffix}`);
}

/** Per-step teardown failure. Teardown continues; do not treat as fatal by itself. */
export function shutdownStepError(step: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const stack = err.stack ?? err.message;
  console.error(`[shutdown:error] ${step} ${stack}`);
  shutdownMark(`${step}-error`, { error: err.message });
}

export function logRuntimeVersions(): void {
  shutdownMark("runtime", {
    electron: process.versions.electron ?? null,
    node: process.versions.node,
    modules: process.versions.modules,
    chrome: process.versions.chrome ?? null,
    platform: process.platform,
    arch: process.arch,
  });
}
