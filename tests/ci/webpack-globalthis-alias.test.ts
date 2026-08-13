import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const require = createRequire(path.join(repoRoot, "webpack.config.js"));
const webpackConfigs = require("./webpack.config.js") as Array<{
  name?: string;
  resolve?: { alias?: Record<string, string> };
  plugins?: Array<{ definitions?: Record<string, unknown>; constructor: { name: string } }>;
}>;

describe("renderer globalThis bundling compatibility", () => {
  const renderer = webpackConfigs.find((config) => config.name === "renderer");
  const aliasPath = renderer?.resolve?.alias?.globalThis;
  const provide = renderer?.plugins?.find((plugin) => plugin.constructor.name === "ProvidePlugin");
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it("aliases webpack ProvidePlugin global to the local provide-global module", () => {
    expect(renderer).toBeDefined();
    expect(provide?.definitions?.global).toBe("globalThis");
    expect(aliasPath).toBe(path.resolve(repoRoot, "src/renderer/provide-global.js"));
    expect(fs.existsSync(aliasPath ?? "")).toBe(true);
  });

  it("resolves provide-global.js to the runtime globalThis, not an npm package", () => {
    const resolved = require(path.join(repoRoot, "src/renderer/provide-global.js"));
    expect(resolved).toBe(globalThis);
    expect(packageJson.dependencies?.globalThis).toBeUndefined();
    expect(packageJson.devDependencies?.globalThis).toBeUndefined();
    expect(packageJson.dependencies?.globalthis).toBeUndefined();
    expect(packageJson.devDependencies?.globalthis).toBeUndefined();
    expect(aliasPath).not.toMatch(/node_modules[/\\]globalthis/i);
  });
});
