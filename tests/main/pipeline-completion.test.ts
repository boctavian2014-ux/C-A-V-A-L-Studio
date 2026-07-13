import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadRecentPipelineCompletion } from "../../src/main/model-handlers";

describe("loadRecentPipelineCompletion", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("returns the newest completion within maxAgeMs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-completion-"));
    roots.push(root);

    const oldRun = path.join(root, ".cavalo", "pipeline", "run-old");
    const newRun = path.join(root, ".cavalo", "pipeline", "run-new");
    fs.mkdirSync(oldRun, { recursive: true });
    fs.mkdirSync(newRun, { recursive: true });

    const oldTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const newTime = new Date().toISOString();

    fs.writeFileSync(
      path.join(oldRun, "completion.json"),
      JSON.stringify({
        runId: "run-old",
        writtenFiles: ["a.ts"],
        finishedAt: oldTime,
      })
    );
    fs.writeFileSync(
      path.join(newRun, "completion.json"),
      JSON.stringify({
        runId: "run-new",
        writtenFiles: ["b.ts", "c.ts"],
        finishedAt: newTime,
      })
    );

    const result = loadRecentPipelineCompletion(root);
    expect(result?.runId).toBe("run-new");
    expect(result?.writtenFiles).toEqual(["b.ts", "c.ts"]);
  });

  it("ignores completions older than maxAgeMs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-completion-"));
    roots.push(root);

    const runDir = path.join(root, ".cavalo", "pipeline", "run-stale");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "completion.json"),
      JSON.stringify({
        runId: "run-stale",
        writtenFiles: ["stale.ts"],
        finishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      })
    );

    expect(loadRecentPipelineCompletion(root, 30 * 60 * 1000)).toBeNull();
  });
});
