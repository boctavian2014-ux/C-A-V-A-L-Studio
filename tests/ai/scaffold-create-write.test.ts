/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyFallbackScaffold, getMinimalViteReactScaffoldFiles } from "../../ai/composer/fallback-scaffold";
import { planFinishDiskWritesForUserMessage } from "../../ai/composer/finish-disk-write-gate";
import { applyScaffoldToWorkspace } from "../../ai/composer/scaffold-apply";
import { parseScaffoldFiles } from "../../ai/composer/scaffold-parser";
import { stageDirectChatScaffoldProposal } from "../../ai/composer/direct-chat-propose";
import { resolveEffectiveMode } from "../../ai/modes/mode-router";
import {
  resolveExecutionMode,
  resolveTrustedExecutionCapability,
  shouldGrantChatWriteTurn,
} from "../../ai/modes/execution-mode";
import { resetProposedWritesForTests } from "../../src/main/ai/proposed-writes-buffer";

const WEBSITE_PROMPT =
  "Creează un website de prezentare pentru CAVAL Studio, în folderul curent. Vreau un site modern, dark, orientat către developeri, cu fundal negru, accent cyan/mov, logo CAVAL în header, secțiuni Hero, Funcționalități, Cum funcționează, Beneficii, Call to Action și Footer. Creează toate fișierele necesare pentru a putea porni și previzualiza proiectul local. Nu răspunde doar cu explicații: scrie efectiv fișierele proiectului în workspace.";

const INDEX_WRITE =
  "Creează un index.html simplu. Scrie efectiv fișierele în workspace.";

const FENCE_INDEX = ["```html:index.html", "<!DOCTYPE html><html><body><h1>CAVAL</h1></body></html>", "```"].join(
  "\n"
);

describe("scaffold create-and-write contract", () => {
  const filesOnDisk = new Map<string, string>();

  beforeEach(() => {
    filesOnDisk.clear();
    resetProposedWritesForTests();
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
    resetProposedWritesForTests();
    delete (window as unknown as { caval?: unknown }).caval;
  });

  it("applies valid fences to disk when the turn has a write grant", async () => {
    const plan = planFinishDiskWritesForUserMessage({ userMessage: INDEX_WRITE });
    expect(plan.applyParsedFences).toBe(true);
    const parsed = parseScaffoldFiles(FENCE_INDEX);
    expect(parsed).toHaveLength(1);
    const applied = await applyScaffoldToWorkspace("C:\\proj", parsed);
    expect(applied.written).toEqual(["index.html"]);
    expect(filesOnDisk.get("index.html")).toContain("<h1>CAVAL</h1>");
  });

  it("does not stage proposed writes for SCAFFOLD — finish applies instead", () => {
    const proposed = stageDirectChatScaffoldProposal({
      workspaceRoot: "C:\\proj",
      text: FENCE_INDEX,
      capability: { effective: "SCAFFOLD" },
      stageKey: "scaffold-1",
    });
    expect(proposed).toEqual([]);
  });

  it("falls back to a runnable Vite scaffold when fences are missing", async () => {
    const plan = planFinishDiskWritesForUserMessage({ userMessage: WEBSITE_PROMPT });
    expect(plan.applyFallbackScaffold).toBe(true);
    const result = await applyFallbackScaffold("C:\\proj", { projectName: "caval-e2e" });
    expect(result.written).toEqual(
      expect.arrayContaining(["package.json", "index.html", "src/App.tsx"])
    );
    const files = getMinimalViteReactScaffoldFiles("caval-e2e");
    expect(files.some((f) => f.path === "package.json" && f.content.includes('"dev": "vite"'))).toBe(
      true
    );
    expect(files.some((f) => f.path === "index.html")).toBe(true);
    expect(files.some((f) => f.path === "src/App.tsx")).toBe(true);
  });

  it("Ask/explain without write request does not create files", async () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "Explică-mi rolul fișierului index.html.",
    });
    expect(resolveExecutionMode("Explică-mi rolul fișierului index.html.")).toBe("READ_ONLY");
    expect(plan.applyParsedFences).toBe(false);
    expect(plan.applyFallbackScaffold).toBe(false);
    expect(shouldGrantChatWriteTurn(resolveTrustedExecutionCapability({
      userMessage: "Explică-mi rolul fișierului index.html.",
    }))).toBe(false);
    if (plan.applyParsedFences) {
      await applyScaffoldToWorkspace("C:\\proj", parseScaffoldFiles(FENCE_INDEX));
    }
    expect(filesOnDisk.size).toBe(0);
  });

  it("keeps Code mode after a website create prompt", () => {
    expect(resolveEffectiveMode("code", WEBSITE_PROMPT).mode).toBe("code");
    expect(resolveEffectiveMode("code", WEBSITE_PROMPT).switched).toBe(false);
  });
});
