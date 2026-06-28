import { describe, expect, it } from "vitest";

import { WarmCachePredictor } from "../../ai/context/warm-cache/warm-cache-predictor";
import { WarmCacheStore } from "../../ai/context/warm-cache/warm-cache-store";
import { warmCacheStore } from "../../ai/context/warm-cache/warm-cache-store";
import type { ParallelLoadResult } from "../../ai/context/parallel/parallel-types";

describe("WarmCacheStore", () => {
  it("upserts documents with embeddings and symbols from parallel result", () => {
    const store = new WarmCacheStore();
    const result: ParallelLoadResult = {
      documents: [
        {
          id: "doc1",
          path: "src/app.ts",
          language: "ts",
          contentHash: "abc",
          chunks: [{ id: "doc1:1", documentId: "doc1", path: "src/app.ts", text: "export function app() {}", startLine: 1, endLine: 1 }],
        },
      ],
      embeddings: [{ chunkId: "doc1:1", vector: [0.1], model: "test" }],
      symbols: [{ name: "app", kind: "function", file: "src/app.ts", line: 1 }],
      dependencies: [{ from: "src/app.ts", to: "./lib", kind: "import" }],
      semantics: [{ file: "src/app.ts", tokens: 5, lines: 1, imports: 0, exports: 1, keywords: ["export"] }],
      durationMs: 10,
    };

    store.upsertFromParallel(result);
    const entry = store.get("src/app.ts");
    expect(entry?.document?.path).toBe("src/app.ts");
    expect(entry?.embeddings).toHaveLength(1);
    expect(entry?.symbols[0]?.name).toBe("app");
    expect(entry?.dependencies[0]?.to).toBe("./lib");
  });

  it("invalidates stale entries on content hash change", () => {
    const store = new WarmCacheStore();
    store.upsertFromParallel({
      documents: [{ id: "d", path: "a.ts", language: "ts", contentHash: "v1", chunks: [] }],
      embeddings: [],
      symbols: [],
      dependencies: [],
      semantics: [],
      durationMs: 1,
    });
    expect(store.hasFresh("a.ts", "v1")).toBe(true);
    expect(store.hasFresh("a.ts", "v2")).toBe(false);
    store.invalidate("a.ts");
    expect(store.get("a.ts")).toBeUndefined();
  });

  it("reports snapshot counts", () => {
    const store = new WarmCacheStore();
    store.upsertFromParallel({
      documents: [{ id: "d", path: "b.ts", language: "ts", contentHash: "h", chunks: [] }],
      embeddings: [],
      symbols: [{ name: "x", kind: "const", file: "b.ts", line: 1 }],
      dependencies: [],
      semantics: [],
      durationMs: 1,
    });
    const snap = store.snapshot();
    expect(snap.warmedFiles).toBe(1);
    expect(snap.symbols).toBe(1);
  });
});

describe("WarmCachePredictor", () => {
  const predictor = new WarmCachePredictor();

  it("predicts pipeline reason on pipeline.start", () => {
    const prediction = predictor.predict({
      workspaceRoot: "/p",
      userAction: "pipeline.start",
      activeFile: "/p/src/app.ts",
    });
    expect(prediction.reason).toBe("pipeline");
    expect(prediction.confidence).toBeGreaterThan(0.5);
    expect(prediction.files.length).toBeGreaterThan(0);
  });

  it("includes related extension candidates for active file", () => {
    const prediction = predictor.predict({
      workspaceRoot: "/p",
      activeFile: "/p/src/app.ts",
    });
    expect(prediction.files.some((f) => f.endsWith("app.tsx") || f.includes("app"))).toBe(true);
  });

  it("includes files matching objective keywords from warm store", () => {
    warmCacheStore.upsertFromParallel({
      documents: [
        {
          id: "d1",
          path: "/p/src/payment.service.ts",
          language: "ts",
          contentHash: "h1",
          chunks: [],
        },
      ],
      embeddings: [],
      symbols: [{ name: "PaymentService", kind: "class", file: "/p/src/payment.service.ts", line: 1 }],
      dependencies: [],
      semantics: [{ file: "/p/src/payment.service.ts", tokens: 10, lines: 1, imports: 0, exports: 1, keywords: ["payment", "stripe"] }],
      durationMs: 1,
    });
    const prediction = predictor.predict({
      workspaceRoot: "/p",
      objectiveDraft: "implement stripe webhook payment",
    });
    expect(prediction.files.some((f) => f.includes("payment.service"))).toBe(true);
  });
});
