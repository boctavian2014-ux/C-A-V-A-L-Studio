import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceIndex } from "../../../src/shared/workspace-index-contract";

const indexState: { index: WorkspaceIndex; root: string | null } = {
  index: { files: [], lastFullScan: 0, totalFiles: 0 },
  root: null,
};

vi.mock("../../../src/main/workspace/workspace-index-service", () => ({
  workspaceIndexService: {
    getSummary: () => ({
      totalFiles: indexState.index.totalFiles,
      lastFullScan: indexState.index.lastFullScan,
      indexing: false,
      workspaceRoot: indexState.root,
    }),
    getIndex: () => indexState.index,
  },
}));

vi.mock("../../../src/main/workspace/workspace-index-store", () => ({
  loadWorkspaceIndex: async () =>
    indexState.index.lastFullScan > 0 || indexState.index.files.length > 0
      ? indexState.index
      : null,
}));

import {
  buildEnhancedContext,
  estimateTokens,
  extractSearchQuery,
  formatEnhancedContextForPrompt,
  readFileRedacted,
  truncateToTokens,
} from "../../../src/main/ai/enhanced-context";

describe("7d.3 enhanced context", () => {
  const roots: string[] = [];

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
  }

  beforeEach(() => {
    indexState.index = { files: [], lastFullScan: 0, totalFiles: 0 };
    indexState.root = null;
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("extracts identifier keywords from userMessage", () => {
    expect(extractSearchQuery("Fix the bug in validateEmail")).toBe("validateEmail");
    expect(extractSearchQuery("Refactor UserService to use async")).toBe("UserService");
    expect(extractSearchQuery("look at src/utils/validation.ts please")).toContain(
      "validation"
    );
  });

  it("includes relevant search hits and always scores current file 1.0", async () => {
    const root = tempRoot("caval-7d3-");
    fs.mkdirSync(path.join(root, "src", "utils"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "app"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "utils", "validation.ts"),
      `export function validateEmail(s: string) { return s.includes("@"); }\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "app", "main.ts"),
      `export const boot = 1;\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "utils", "other.ts"),
      `export function validateEmailHelper() {}\n`
    );

    indexState.root = root;
    indexState.index = {
      lastFullScan: Date.now(),
      totalFiles: 3,
      files: [
        {
          path: "src/utils/validation.ts",
          language: "ts",
          symbols: [{ name: "validateEmail", kind: "function", line: 1 }],
          imports: [],
          exports: ["validateEmail"],
          sizeBytes: 80,
          lastIndexed: 1,
        },
        {
          path: "src/utils/other.ts",
          language: "ts",
          symbols: [{ name: "validateEmailHelper", kind: "function", line: 1 }],
          imports: [],
          exports: ["validateEmailHelper"],
          sizeBytes: 60,
          lastIndexed: 1,
        },
        {
          path: "src/app/main.ts",
          language: "ts",
          symbols: [{ name: "boot", kind: "const", line: 1 }],
          imports: [],
          exports: ["boot"],
          sizeBytes: 30,
          lastIndexed: 1,
        },
      ],
    };

    const ctx = await buildEnhancedContext(root, {
      userMessage: "Fix the bug in validateEmail",
      currentFile: "src/app/main.ts",
      maxFiles: 3,
    });

    expect(ctx.searchQuery).toBe("validateEmail");
    expect(ctx.currentFile?.path).toBe("src/app/main.ts");
    expect(ctx.currentFile?.relevanceScore).toBe(1.0);
    expect(ctx.relatedFiles.length).toBeGreaterThan(0);
    expect(ctx.relatedFiles[0]?.path).toBe("src/utils/validation.ts");
    expect(ctx.relatedFiles[0]?.relevanceScore).toBeGreaterThanOrEqual(0.6);
    expect(ctx.relatedFiles.every((f) => f.path !== "src/app/main.ts")).toBe(true);
  });

  it("respects max 3 related files and skips score < 0.6", async () => {
    const root = tempRoot("caval-7d3-cap-");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });

    const files = Array.from({ length: 6 }, (_, i) => {
      const name = `validateEmailThing${i}`;
      const rel = `src/${name}.ts`;
      fs.writeFileSync(path.join(root, rel), `export function ${name}() {}\n`);
      return {
        path: rel,
        language: "ts",
        symbols: [{ name, kind: "function" as const, line: 1 }],
        imports: [] as string[],
        exports: [name],
        sizeBytes: 40,
        lastIndexed: 1,
      };
    });

    // Low-score fuzzy-only path that should be skipped when query is exact-ish
    files.push({
      path: "src/unrelated.ts",
      language: "ts",
      symbols: [{ name: "xyz", kind: "function", line: 1 }],
      imports: [],
      exports: ["xyz"],
      sizeBytes: 20,
      lastIndexed: 1,
    });
    fs.writeFileSync(path.join(root, "src", "unrelated.ts"), `export function xyz() {}\n`);

    indexState.root = root;
    indexState.index = {
      files,
      lastFullScan: Date.now(),
      totalFiles: files.length,
    };

    const ctx = await buildEnhancedContext(root, {
      userMessage: "validateEmailThing0",
      maxFiles: 3,
    });

    expect(ctx.relatedFiles.length).toBeLessThanOrEqual(3);
    expect(ctx.relatedFiles.every((f) => f.relevanceScore >= 0.6)).toBe(true);
    expect(ctx.relatedFiles.some((f) => f.path === "src/unrelated.ts")).toBe(false);
  });

  it("applies redaction and token caps", async () => {
    const root = tempRoot("caval-7d3-redact-");
    const rel = "src/secretish.ts";
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const longBody = "x".repeat(20_000);
    fs.writeFileSync(
      path.join(root, rel),
      `const key = "sk-abcdefghijklmnopqrstuvwxyz012345";\n${longBody}\n`
    );

    const content = await readFileRedacted(root, rel, 100);
    expect(content).not.toBeNull();
    expect(content!).not.toMatch(/sk-abcdefghijklmnopqrstuvwxyz012345/);
    expect(content!).toMatch(/REDACTED/);
    expect(estimateTokens(content!)).toBeLessThanOrEqual(100);
    expect(truncateToTokens("abcdefghij", 1).length).toBeLessThanOrEqual(5);
  });

  it("falls back to current file only when index is missing", async () => {
    const root = tempRoot("caval-7d3-fallback-");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "only.ts"), `export const only = 1;\n`);

    indexState.root = null;
    indexState.index = { files: [], lastFullScan: 0, totalFiles: 0 };

    const ctx = await buildEnhancedContext(root, {
      userMessage: "Fix validateEmail please",
      currentFile: "src/only.ts",
    });

    expect(ctx.relatedFiles).toEqual([]);
    expect(ctx.currentFile?.path).toBe("src/only.ts");
    expect(ctx.currentFile?.relevanceScore).toBe(1.0);
    expect(ctx.totalTokens).toBeGreaterThan(0);
  });

  it("formats an untrusted prompt block", async () => {
    const block = formatEnhancedContextForPrompt({
      searchQuery: "validateEmail",
      totalTokens: 10,
      currentFile: {
        path: "src/app.ts",
        content: "export const a = 1;",
        relevanceScore: 1,
        symbols: [],
      },
      relatedFiles: [
        {
          path: "src/utils/validation.ts",
          content: "export function validateEmail() {}",
          relevanceScore: 0.95,
          symbols: [{ name: "validateEmail", kind: "function", line: 1 }],
        },
      ],
    });
    expect(block).toContain('kind="untrusted workspace content"');
    expect(block).toContain("--- Current file: src/app.ts ---");
    expect(block).toContain("--- Related file: src/utils/validation.ts (relevance: 0.95) ---");
  });
});
