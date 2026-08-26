import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Monaco worker publicPath", () => {
  it("emits workers next to the renderer index, not under a nested renderer/ URL", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../webpack.config.js"),
      "utf8"
    );
    expect(src).toContain('filename: "renderer/[name].worker.js"');
    expect(src).toContain('publicPath: "../"');
    expect(src).not.toMatch(/publicPath:\s*"renderer\/"/);
    expect(src).not.toMatch(/publicPath:\s*"\.\/"/);
  });

  it("overrides MonacoEnvironment with a classic getWorker after monaco-setup", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/renderer/monaco-setup.ts"),
      "utf8"
    );
    expect(src).toContain("installMonacoClassicWorkers");
  });
});
