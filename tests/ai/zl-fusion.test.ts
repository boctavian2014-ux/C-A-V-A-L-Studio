import { describe, expect, it } from "vitest";
import {
  buildWarmContextBlock,
  injectWarmContextIntoMessages,
} from "../../ai/composer/zero-latency/zl-fusion";
import { warmCacheStore } from "../../ai/context/warm-cache/warm-cache-store";
import { zeroLatencyCache } from "../../ai/composer/zero-latency/zl-cache";

describe("Zero-Latency Fusion", () => {
  it("injectWarmContextIntoMessages appends warm block to last user message", () => {
    const messages = injectWarmContextIntoMessages(
      [
        { role: "system", content: "sys" },
        { role: "user", content: "Explică codul" },
      ],
      "File: src/app.ts\nSymbols: main"
    );
    expect(messages[1].content).toContain("Zero-Latency");
    expect(messages[1].content).toContain("src/app.ts");
  });

  it("buildWarmContextBlock reads warm cache entries", () => {
    warmCacheStore.upsertFromParallel({
      workspaceRoot: "/proj",
      documents: [
        {
          id: "d1",
          path: "/proj/src/app.ts",
          language: "typescript",
          contentHash: "abc",
          chunks: [{ id: "c1", documentId: "d1", path: "/proj/src/app.ts", text: "export function main() {}", startLine: 1, endLine: 1 }],
        },
      ],
      embeddings: [],
      symbols: [{ name: "main", kind: "function", file: "/proj/src/app.ts", line: 1 }],
      dependencies: [],
      semantics: [{ file: "/proj/src/app.ts", tokens: 10, lines: 1, imports: 0, exports: 1, keywords: ["main"] }],
    });

    const block = buildWarmContextBlock({
      workspaceRoot: "/proj",
      activeFile: "/proj/src/app.ts",
    });
    expect(block).toContain("main");
    expect(block).toContain("export function main");
  });

  it("buildWarmContextBlock includes partial plan from ZL cache", () => {
    zeroLatencyCache.upsert({
      workspaceRoot: "/proj",
      objectiveDraft: "fix bug",
      partialPlan: {
        objective: "fix bug",
        confidence: 0.8,
        createdAt: Date.now(),
        plan: {
          objective: "fix bug",
          steps: [{ id: "s1", title: "Inspect", rationale: "Read files", files: [], symbols: [], risk: "low" }],
          risks: [],
          validation: [],
        },
      },
    });

    const block = buildWarmContextBlock({
      workspaceRoot: "/proj",
      objectiveDraft: "fix bug",
    });
    expect(block).toContain("Plan parțial");
    expect(block).toContain("Inspect");
  });
});
