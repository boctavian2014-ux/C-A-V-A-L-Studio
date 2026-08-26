/**
 * monaco-editor >=0.52 creates workers with `{ type: "module" }` from getWorkerUrl.
 * monaco-editor-webpack-plugin still emits classic (importScripts) bundles, and
 * Chromium rejects relative Worker URLs on file://. Prefer getWorker + blob bootstrap.
 */

export type MonacoWorkerEnvironment = {
  getWorkerUrl?: (moduleId: string, label: string) => string;
  getWorker?: (moduleId: string, label: string) => Worker;
  globalAPI?: boolean;
};

export function resolveWorkerScriptHref(workerSrc: string, baseHref: string): string {
  if (workerSrc.startsWith("blob:") || /^(https?:|file:)/i.test(workerSrc)) {
    return workerSrc;
  }
  if (workerSrc.startsWith("//")) {
    const protocol = baseHref.startsWith("https:") ? "https:" : "file:";
    return `${protocol}${workerSrc}`;
  }
  return new URL(workerSrc, baseHref).href;
}

export function classicWorkerBootstrapSource(scriptHref: string, label: string): string {
  return `/* caval-monaco:${label} */ importScripts(${JSON.stringify(scriptHref)});`;
}

export function installMonacoClassicWorkers(
  host: {
    MonacoEnvironment?: MonacoWorkerEnvironment;
    location?: { href: string };
  } = globalThis as typeof globalThis & {
    MonacoEnvironment?: MonacoWorkerEnvironment;
    location?: { href: string };
  }
): void {
  const prev = host.MonacoEnvironment ?? {};
  const prevGetWorkerUrl = prev.getWorkerUrl?.bind(prev);
  const baseHref =
    host.location?.href ??
    (typeof window !== "undefined" ? window.location.href : "file:///");

  host.MonacoEnvironment = {
    ...prev,
    getWorker(moduleId: string, label: string) {
      const raw = prevGetWorkerUrl?.(moduleId, label);
      if (!raw) {
        throw new Error(`Monaco worker URL missing for ${label}`);
      }
      if (raw.startsWith("blob:")) {
        return new Worker(raw);
      }
      const href = resolveWorkerScriptHref(raw, baseHref);
      const blob = URL.createObjectURL(
        new Blob([classicWorkerBootstrapSource(href, label)], {
          type: "application/javascript",
        })
      );
      return new Worker(blob);
    },
  };
}
