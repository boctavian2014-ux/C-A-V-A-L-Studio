/**
 * @vitest-environment jsdom
 *
 * UI/integration contract: timeout (or exhausted fence retry) must produce an
 * exact file tree — never silent Vite on a product brief, never src/hello.ts
 * instead of hello.txt, never a success toast on a partial Vite manifest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseUnambiguousSingleFileCreate,
  shouldSkipEmptyFenceRetry,
  shouldSkipGenericViteFallback,
} from "../../ai/composer/code-mode-done-contract";
import {
  filterParsedScaffoldFilesForUserMessage,
  formatIncompleteViteScaffoldError,
  recoverDeterministicExplicitWrites,
  restrictWrittenFilesToUnambiguousPath,
} from "../../ai/composer/deterministic-explicit-writes";
import {
  applyExplicitMinimalViteScaffold,
  getMinimalViteReactScaffoldFiles,
  missingMinimalViteManifest,
} from "../../ai/composer/fallback-scaffold";
import { planFinishDiskWritesForUserMessage } from "../../ai/composer/finish-disk-write-gate";
import { applyScaffoldToWorkspace } from "../../ai/composer/scaffold-apply";
import { parseScaffoldFiles } from "../../ai/composer/scaffold-parser";
import { TURN_WATCHDOG_ABORT_REASON } from "../../src/shared/turn-watchdog";

const HELLO = "Creează hello.txt cu Hello";
const VITE = "Creează scaffold Vite minim";
const PRODUCT = "fă un magazin de baschet";
const WRONG_FENCE = ["```typescript:src/hello.ts", "export const hello = 'Hello';", "```"].join("\n");
const PARTIAL_VITE_FENCES = [
  "```tsx:src/App.tsx",
  "export default function App() { return <div>partial</div>; }",
  "```",
  "```tsx:src/main.tsx",
  "import App from './App';",
  "```",
].join("\n");

const VITE_MANIFEST = [
  "package.json",
  "index.html",
  "src/main.tsx",
  "src/App.tsx",
  "vite.config.ts",
] as const;

const filesOnDisk = new Map<string, string>();
let failPackageJson = false;

function diskKeys(filesOnDisk: Map<string, string>): string[] {
  return [...new Set([...filesOnDisk.keys()].map((k) => k.replace(/\\/g, "/")))]
    .filter((k) => !k.startsWith("c:/"))
    .sort();
}

async function simulateTimeoutTree(
  userMessage: string,
  parseSource: string
): Promise<{
  written: string[];
  complete: boolean;
  kind: string;
  errorMessage?: string;
  usedViteGenerator: boolean;
  files: string[];
}> {
  const plan = planFinishDiskWritesForUserMessage({
    userMessage,
    timedOut: true,
    error: TURN_WATCHDOG_ABORT_REASON,
    agentMode: "code",
  });
  let written: string[] = [];
  if (plan.applyParsedFences) {
    const parsed = filterParsedScaffoldFilesForUserMessage(
      parseScaffoldFiles(parseSource),
      userMessage
    );
    const applied = await applyScaffoldToWorkspace("C:\\proj", parsed);
    written = applied.written;
  }
  written = restrictWrittenFilesToUnambiguousPath(written, userMessage);
  const recovered =
    plan.timeoutRecovery && plan.applyFallbackScaffold
      ? await recoverDeterministicExplicitWrites({
          userMessage,
          projectPath: "C:\\proj",
          writtenFiles: written,
          projectName: "caval-e2e",
        })
      : {
          kind: "none" as const,
          written: [],
          complete: false,
          usedViteGenerator: false,
          errorMessage: undefined,
        };
  if (recovered.kind === "vite" || recovered.kind === "single-file") {
    written = restrictWrittenFilesToUnambiguousPath(
      [...new Set([...written, ...recovered.written])],
      userMessage
    );
  }
  return {
    written: written.sort(),
    complete: recovered.kind === "none" ? written.length > 0 : recovered.complete,
    kind: recovered.kind,
    errorMessage: recovered.errorMessage,
    usedViteGenerator: recovered.usedViteGenerator,
    files: diskKeys(filesOnDisk),
  };
}

describe("deterministic explicit writes on timeout", () => {
  beforeEach(() => {
    filesOnDisk.clear();
    failPackageJson = false;
    (window as unknown as { caval: unknown }).caval = {
      workspaceSync: vi.fn(async () => ({ ok: true, path: "C:\\proj" })),
      fs: {
        createDir: vi.fn(async () => ({ ok: true })),
        writeFile: vi.fn(async (filePath: string, content: string) => {
          const relative = filePath.replace(/\\/g, "/").replace(/^c:\/proj\//i, "");
          if (failPackageJson && relative === "package.json") {
            return { ok: false, error: "EPERM" };
          }
          filesOnDisk.set(relative, content);
          return { ok: true };
        }),
        readFile: vi.fn(async (filePath: string) => {
          const relative = filePath.replace(/\\/g, "/").replace(/^c:\/proj\//i, "");
          const content = filesOnDisk.get(relative);
          if (content != null) return { ok: true, content, path: relative, language: "plaintext" };
          return { ok: false, code: "NOT_FOUND", message: "missing" };
        }),
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { caval?: unknown }).caval;
  });

  it("parses unambiguous hello.txt and rejects product / missing content", () => {
    expect(parseUnambiguousSingleFileCreate(HELLO)).toEqual({
      path: "hello.txt",
      content: "Hello",
    });
    expect(parseUnambiguousSingleFileCreate("Creează hello.txt")).toBeNull();
    expect(parseUnambiguousSingleFileCreate(PRODUCT)).toBeNull();
    expect(parseUnambiguousSingleFileCreate(VITE)).toBeNull();
    expect(shouldSkipGenericViteFallback(HELLO)).toBe(true);
    expect(shouldSkipEmptyFenceRetry(VITE)).toBe(true);
    expect(shouldSkipEmptyFenceRetry(HELLO)).toBe(true);
  });

  it("timeout + hello.txt writes only hello.txt with Hello, never Vite or src/hello.ts", async () => {
    const result = await simulateTimeoutTree(HELLO, WRONG_FENCE);
    expect(result.kind).toBe("single-file");
    expect(result.complete).toBe(true);
    expect(result.usedViteGenerator).toBe(false);
    expect(result.files).toEqual(["hello.txt"]);
    expect(filesOnDisk.get("hello.txt")).toBe("Hello");
    expect(result.files.some((f) => f.endsWith("hello.ts"))).toBe(false);
    expect(missingMinimalViteManifest(result.files).length).toBeGreaterThan(0);
  });

  it("timeout + explicit Vite completes the min manifest even from partial fences", async () => {
    const result = await simulateTimeoutTree(VITE, PARTIAL_VITE_FENCES);
    expect(result.kind).toBe("vite");
    expect(result.complete).toBe(true);
    expect(result.usedViteGenerator).toBe(true);
    expect(result.files).toEqual(
      expect.arrayContaining([...VITE_MANIFEST, "tsconfig.json"])
    );
    expect(missingMinimalViteManifest(result.files)).toEqual([]);
    expect(filesOnDisk.get("src/App.tsx")).toContain("partial");
    expect(filesOnDisk.get("package.json")).toContain('"dev": "vite"');
    expect(filesOnDisk.get("index.html")).toContain("src/main.tsx");
  });

  it("timeout + empty fences on explicit Vite still writes the generator tree", async () => {
    const result = await simulateTimeoutTree(VITE, "thinking, no fences");
    expect(result.complete).toBe(true);
    expect(result.files.sort()).toEqual(
      getMinimalViteReactScaffoldFiles("caval-e2e")
        .map((f) => f.path)
        .sort()
    );
  });

  it("timeout + product prompt writes nothing — no auto-Vite (ee525db)", async () => {
    const result = await simulateTimeoutTree(PRODUCT, "");
    expect(result.kind).toBe("none");
    expect(result.usedViteGenerator).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.written).toEqual([]);
  });

  it("does not treat a partial Vite tree as success when a required write fails", async () => {
    failPackageJson = true;
    const recovered = await recoverDeterministicExplicitWrites({
      userMessage: VITE,
      projectPath: "C:\\proj",
      writtenFiles: ["src/App.tsx", "src/main.tsx"],
      projectName: "caval-e2e",
    });
    expect(recovered.complete).toBe(false);
    expect(recovered.missing).toContain("package.json");
    expect(recovered.errorMessage).toMatch(/scaffold incomplet/i);
    expect(formatIncompleteViteScaffoldError(recovered.missing)).toMatch(/package\.json/);
    expect(filesOnDisk.has("package.json")).toBe(false);
  });

  it("applyExplicitMinimalViteScaffold uses the internal Vite templates, not Express", async () => {
    const result = await applyExplicitMinimalViteScaffold("C:\\proj", { projectName: "caval-e2e" });
    expect(result.complete).toBe(true);
    expect(result.written).toEqual(
      expect.arrayContaining([...VITE_MANIFEST])
    );
    expect(filesOnDisk.get("package.json")).toContain("vite");
    expect(filesOnDisk.get("package.json")).not.toContain("express");
  });
});
