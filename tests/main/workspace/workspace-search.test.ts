import { describe, expect, it, vi } from "vitest";

import { emptyWorkspaceIndex, type IndexedFile, type WorkspaceIndex } from "../../../src/shared/workspace-index-contract";
import {
  fuzzyMatch,
  INDEX_UNAVAILABLE_MESSAGE,
  isWorkspaceIndexReady,
  searchIndex,
} from "../../../src/main/workspace/workspace-search";

function indexedFile(partial: Partial<IndexedFile> & Pick<IndexedFile, "path">): IndexedFile {
  return {
    language: "ts",
    symbols: [],
    imports: [],
    exports: [],
    sizeBytes: 32,
    lastIndexed: 1,
    ...partial,
  };
}

function indexOf(files: IndexedFile[]): WorkspaceIndex {
  return { files, lastFullScan: 1, totalFiles: files.length };
}

describe("7d.2 workspace search", () => {
  it("exact symbol match scores 1.0 and ranks first", () => {
    const index = indexOf([
      indexedFile({
        path: "src/other.ts",
        symbols: [{ name: "greetHelper", kind: "function", line: 4 }],
      }),
      indexedFile({
        path: "src/app.ts",
        symbols: [{ name: "greet", kind: "function", line: 12 }],
      }),
    ]);

    const results = searchIndex(index, { text: "greet" });
    expect(results[0]?.file.path).toBe("src/app.ts");
    expect(results[0]?.score).toBe(1.0);
    expect(results[0]?.matches).toEqual(
      expect.arrayContaining([{ type: "symbol", value: "greet", line: 12 }])
    );
  });

  it("partial path search returns relevant files", () => {
    const index = indexOf([
      indexedFile({ path: "src/components/Button.tsx" }),
      indexedFile({ path: "src/lib/debounce.ts" }),
      indexedFile({ path: "docs/readme.md" }),
    ]);

    const results = searchIndex(index, { text: "button", kind: "file" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.file.path).toContain("Button");
    expect(results[0]?.matches.some((m) => m.type === "path")).toBe(true);
  });

  it("fuzzy subsequence match scores low", () => {
    expect(fuzzyMatch("workspaceindex", "wsi")).toBe(0.3);
    const index = indexOf([
      indexedFile({
        path: "src/workspace-index.ts",
        symbols: [{ name: "WorkspaceIndexService", kind: "class", line: 8 }],
      }),
    ]);
    const results = searchIndex(index, { text: "wsi", kind: "symbol" });
    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBe(0.3);
  });

  it("respects limit 20", () => {
    const files = Array.from({ length: 35 }, (_, i) =>
      indexedFile({
        path: `src/file-${String(i).padStart(2, "0")}.ts`,
        symbols: [{ name: "sharedUtil", kind: "function", line: 1 }],
      })
    );
    const results = searchIndex(indexOf(files), { text: "sharedUtil", limit: 20 });
    expect(results).toHaveLength(20);
  });

  it("empty index returns zero results without throwing", () => {
    expect(searchIndex(emptyWorkspaceIndex(), { text: "anything" })).toEqual([]);
    expect(searchIndex({ files: [], lastFullScan: 1, totalFiles: 0 }, { text: "x" })).toEqual([]);
  });

  it("filters by kind: symbols vs files", () => {
    const index = indexOf([
      indexedFile({
        path: "src/search.ts",
        symbols: [{ name: "runQuery", kind: "function", line: 3 }],
        imports: ["./db"],
        exports: ["runQuery"],
      }),
    ]);

    const symbols = searchIndex(index, { text: "search", kind: "symbol" });
    expect(symbols).toEqual([]);

    const files = searchIndex(index, { text: "search", kind: "file" });
    expect(files).toHaveLength(1);
    expect(files[0]?.matches.every((m) => m.type === "path")).toBe(true);

    const onlySymbols = searchIndex(index, { text: "runQuery", kind: "symbol" });
    expect(onlySymbols).toHaveLength(1);
    expect(onlySymbols[0]?.matches.every((m) => m.type === "symbol")).toBe(true);

    const onlyImports = searchIndex(index, { text: "./db", kind: "import" });
    expect(onlyImports).toHaveLength(1);
    expect(onlyImports[0]?.matches.every((m) => m.type === "import")).toBe(true);

    const onlyExports = searchIndex(index, { text: "runQuery", kind: "export" });
    expect(onlyExports).toHaveLength(1);
    expect(onlyExports[0]?.matches.every((m) => m.type === "export")).toBe(true);
  });

  it("blank query returns no results", () => {
    const index = indexOf([indexedFile({ path: "src/a.ts" })]);
    expect(searchIndex(index, { text: "   " })).toEqual([]);
  });

  it("does not mutate the index (read-only)", () => {
    const file = indexedFile({
      path: "src/a.ts",
      symbols: [{ name: "alpha", kind: "const", line: 1 }],
    });
    const index = indexOf([file]);
    const snapshot = structuredClone(index);
    searchIndex(index, { text: "alpha" });
    expect(index).toEqual(snapshot);
  });

  it("isWorkspaceIndexReady distinguishes missing vs empty scanned index", () => {
    expect(isWorkspaceIndexReady(null)).toBe(false);
    expect(isWorkspaceIndexReady(emptyWorkspaceIndex())).toBe(false);
    expect(isWorkspaceIndexReady({ files: [], lastFullScan: Date.now(), totalFiles: 0 })).toBe(
      true
    );
    expect(
      isWorkspaceIndexReady({
        files: [indexedFile({ path: "a.ts" })],
        lastFullScan: 0,
        totalFiles: 1,
      })
    ).toBe(true);
    expect(INDEX_UNAVAILABLE_MESSAGE).toMatch(/Index not available/i);
  });
});
