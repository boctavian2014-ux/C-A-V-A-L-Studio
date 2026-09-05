/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recoverDeterministicExplicitWrites } from "../../ai/composer/deterministic-explicit-writes";
import { applyFallbackScaffold } from "../../ai/composer/fallback-scaffold";
import {
  buildTimeoutScaffoldRecoveryPatch,
  planFinishDiskWritesForUserMessage,
} from "../../ai/composer/finish-disk-write-gate";
import { applyScaffoldToWorkspace } from "../../ai/composer/scaffold-apply";
import { parseScaffoldFiles, isBlockedScaffoldPath } from "../../ai/composer/scaffold-parser";
import { TURN_WATCHDOG_ABORT_REASON } from "../../src/shared/turn-watchdog";

const CREATE_WRITE =
  "Creează un website de prezentare pentru CAVAL Studio, în folderul curent. Creează toate fișierele necesare pentru a putea porni și previzualiza proiectul local. Nu răspunde doar cu explicații: scrie efectiv fișierele proiectului în workspace.";

const FENCE_INDEX = [
  "```html:index.html",
  "<!DOCTYPE html><html><body><h1>CAVAL Hero</h1></body></html>",
  "```",
].join("\n");

const FENCE_INTERNAL = [
  "```json:.caval/context-cache/documents.json",
  "{\"docs\":[]}",
  "```",
  "```txt:.cavalo/notes.txt",
  "secret",
  "```",
].join("\n");

describe("timeout scaffold recovery apply", () => {
  const filesOnDisk = new Map<string, string>();

  beforeEach(() => {
    filesOnDisk.clear();
    (window as unknown as { caval: unknown }).caval = {
      workspaceSync: vi.fn(async () => ({ ok: true, path: "C:\\proj" })),
      fs: {
        createDir: vi.fn(async () => ({ ok: true })),
        writeFile: vi.fn(async (filePath: string, content: string) => {
          const relative = filePath.replace(/\\/g, "/").replace(/^c:\/proj\//i, "");
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

  it("writes already-parsed fences on create-and-write timeout", async () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: CREATE_WRITE,
      timedOut: true,
      error: TURN_WATCHDOG_ABORT_REASON,
    });
    expect(plan.applyParsedFences).toBe(true);
    const applied = await applyScaffoldToWorkspace("C:\\proj", parseScaffoldFiles(FENCE_INDEX));
    expect(applied.written).toEqual(["index.html"]);
    expect(filesOnDisk.get("index.html")).toContain("CAVAL Hero");
  });

  it("keeps Vite fallback available and runs it for product briefs and explicit Vite", async () => {
    const {
      isExplicitMinimalViteScaffoldRequest,
      shouldSkipGenericViteFallback,
    } = await import("../../ai/composer/code-mode-done-contract");
    const { shouldRecoverProductWorkspaceScaffold } = await import(
      "../../ai/composer/deterministic-explicit-writes"
    );

    const productPlan = planFinishDiskWritesForUserMessage({
      userMessage: CREATE_WRITE,
      timedOut: true,
      error: TURN_WATCHDOG_ABORT_REASON,
    });
    expect(productPlan.applyFallbackScaffold).toBe(true);
    expect(isExplicitMinimalViteScaffoldRequest(CREATE_WRITE)).toBe(false);
    expect(shouldSkipGenericViteFallback(CREATE_WRITE)).toBe(false);
    expect(shouldRecoverProductWorkspaceScaffold(CREATE_WRITE, [])).toBe(true);

    const recoveredProduct = await recoverDeterministicExplicitWrites({
      userMessage: CREATE_WRITE,
      projectPath: "C:\\proj",
      writtenFiles: [],
      projectName: "caval-e2e",
    });
    expect(recoveredProduct.kind).toBe("vite");
    expect(recoveredProduct.complete).toBe(true);
    expect(recoveredProduct.usedViteGenerator).toBe(true);
    filesOnDisk.clear();

    const explicit = "Creează scaffold Vite minim";
    const explicitPlan = planFinishDiskWritesForUserMessage({
      userMessage: explicit,
      timedOut: true,
      error: TURN_WATCHDOG_ABORT_REASON,
      agentMode: "code",
    });
    expect(explicitPlan.applyFallbackScaffold).toBe(true);
    expect(isExplicitMinimalViteScaffoldRequest(explicit)).toBe(true);
    expect(
      explicitPlan.applyFallbackScaffold &&
        isExplicitMinimalViteScaffoldRequest(explicit) &&
        !shouldSkipGenericViteFallback(explicit)
    ).toBe(true);

    const recovered = await recoverDeterministicExplicitWrites({
      userMessage: explicit,
      projectPath: "C:\\proj",
      writtenFiles: ["src/App.tsx"],
      projectName: "caval-e2e",
    });
    expect(recovered.kind).toBe("vite");
    expect(recovered.complete).toBe(true);
    expect(recovered.usedViteGenerator).toBe(true);
    expect(recovered.written).toEqual(
      expect.arrayContaining([
        "package.json",
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
        "vite.config.ts",
        "tsconfig.json",
      ])
    );
    const patch = buildTimeoutScaffoldRecoveryPatch({
      written: recovered.written,
      usedFallback: true,
    });
    expect(patch.timeoutRecovered).toBe(true);
    expect(patch.error).toBe(TURN_WATCHDOG_ABORT_REASON);
  });

  it("does not duplicate files on a second fallback after timeout recovery", async () => {
    await applyFallbackScaffold("C:\\proj", { projectName: "caval-e2e" });
    const first = new Set(filesOnDisk.keys());
    const second = await applyFallbackScaffold("C:\\proj", { projectName: "caval-e2e" });
    expect(second.written).toEqual([]);
    expect(second.skippedBecauseExisting).toBe(true);
    expect([...filesOnDisk.keys()].sort()).toEqual([...first].sort());
  });

  it("never applies internal metadata paths from timeout fences", async () => {
    expect(isBlockedScaffoldPath(".caval/context-cache/documents.json")).toBe(true);
    expect(isBlockedScaffoldPath(".cavalo/notes.txt")).toBe(true);
    const applied = await applyScaffoldToWorkspace("C:\\proj", parseScaffoldFiles(FENCE_INTERNAL));
    expect(applied.written).toEqual([]);
    expect([...filesOnDisk.keys()]).toEqual([]);
  });

  it("Ask timeout does not write even when fences exist", async () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "Explică-mi rolul fișierului index.html.",
      timedOut: true,
      error: TURN_WATCHDOG_ABORT_REASON,
    });
    if (plan.applyParsedFences) {
      await applyScaffoldToWorkspace("C:\\proj", parseScaffoldFiles(FENCE_INDEX));
    }
    if (plan.applyFallbackScaffold) {
      await applyFallbackScaffold("C:\\proj");
    }
    expect(filesOnDisk.size).toBe(0);
    expect(plan.allowWriteFollowup).toBe(false);
  });

  it("timeout recovery never grants SCAFFOLD_CONTINUE follow-up", () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: CREATE_WRITE,
      timedOut: true,
      error: TURN_WATCHDOG_ABORT_REASON,
    });
    expect(plan.allowWriteFollowup).toBe(false);
    expect(plan.autoInstallDependencies).toBe(false);
  });
});
