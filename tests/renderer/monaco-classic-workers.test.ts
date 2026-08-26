import { describe, expect, it, vi } from "vitest";

import {
  classicWorkerBootstrapSource,
  installMonacoClassicWorkers,
  resolveWorkerScriptHref,
} from "../../src/renderer/monaco-worker-env";

describe("monaco classic workers on file://", () => {
  it("resolves relative webpack worker URLs against the renderer page", () => {
    expect(
      resolveWorkerScriptHref(
        "../renderer/editor.worker.js",
        "file:///C:/app/dist/renderer/index.html"
      )
    ).toBe("file:///C:/app/dist/renderer/editor.worker.js");
  });

  it("bootstraps webpack workers with importScripts, not ESM import", () => {
    const src = classicWorkerBootstrapSource(
      "file:///C:/app/dist/renderer/editor.worker.js",
      "editorWorkerService"
    );
    expect(src).toContain("importScripts");
    expect(src).not.toMatch(/\bimport\s+/);
  });

  it("installs getWorker so Monaco does not construct type=module workers", () => {
    const created: Array<{ url: string; options?: WorkerOptions }> = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: string | URL, options?: WorkerOptions) {
          created.push({ url: String(url), options });
        }
      }
    );
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:caval-monaco-worker");

    const host: {
      MonacoEnvironment?: {
        getWorkerUrl?: (moduleId: string, label: string) => string;
        getWorker?: (moduleId: string, label: string) => Worker;
      };
      location: { href: string };
    } = {
      location: { href: "file:///C:/app/dist/renderer/index.html" },
      MonacoEnvironment: {
        getWorkerUrl: () => "../renderer/editor.worker.js",
      },
    };

    installMonacoClassicWorkers(host);
    const worker = host.MonacoEnvironment?.getWorker?.("workerMain.js", "editorWorkerService");
    expect(worker).toBeDefined();
    expect(created[0]?.url).toBe("blob:caval-monaco-worker");
    expect(created[0]?.options?.type).not.toBe("module");
    expect(createObjectURL).toHaveBeenCalled();

    createObjectURL.mockRestore();
    vi.unstubAllGlobals();
  });
});
