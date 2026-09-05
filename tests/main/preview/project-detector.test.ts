import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  describeMissingPreview,
  detectPreviewWorkspace,
  detectProject,
  findStaticHtmlPreviewRoot,
} from "../../../src/main/preview/project-detector";

describe("project-detector", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function mkDir(name: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `caval-det-${name}-`));
    dirs.push(dir);
    return dir;
  }

  function writePkg(cwd: string, pkg: Record<string, unknown>): void {
    fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify(pkg), "utf8");
  }

  it("returns unknown when package.json is missing", () => {
    const cwd = mkDir("empty");
    const result = detectProject(cwd);
    expect(result.kind).toBe("unknown");
    expect(result.hasPackageJson).toBe(false);
    expect(result.suggestedCommand).toBeNull();
    expect(result.suggestedUrl).toBeNull();
  });

  it("finds a static landing page index.html", () => {
    const cwd = mkDir("landing");
    fs.writeFileSync(path.join(cwd, "index.html"), "<html></html>", "utf8");
    expect(findStaticHtmlPreviewRoot(cwd)).toBe(cwd);
  });

  it("returns unknown with hasPackageJson true when package.json is invalid", () => {
    const cwd = mkDir("bad-json");
    fs.writeFileSync(path.join(cwd, "package.json"), "{ not json", "utf8");
    const result = detectProject(cwd);
    expect(result.kind).toBe("unknown");
    expect(result.hasPackageJson).toBe(false);
  });

  it("detects Expo before Vite when both signals exist", () => {
    const cwd = mkDir("expo-over-vite");
    writePkg(cwd, {
      dependencies: { expo: "51.0.0", vite: "5.0.0" },
      scripts: { start: "expo start", dev: "vite" },
    });
    const result = detectProject(cwd);
    expect(result.kind).toBe("expo");
    expect(result.suggestedCommand).toBe("npm run start");
    expect(result.suggestedUrl).toBeNull();
  });

  it("detects Expo via app.json without deps.expo", () => {
    const cwd = mkDir("expo-app-json");
    writePkg(cwd, { scripts: { start: "expo start" } });
    fs.writeFileSync(path.join(cwd, "app.json"), "{}", "utf8");
    expect(detectProject(cwd).kind).toBe("expo");
  });

  it("detects Next.js via deps.next", () => {
    const cwd = mkDir("next-deps");
    writePkg(cwd, {
      dependencies: { next: "14.0.0" },
      scripts: { dev: "next dev" },
    });
    const result = detectProject(cwd);
    expect(result.kind).toBe("next");
    expect(result.suggestedCommand).toBe("npm run dev");
    expect(result.suggestedUrl).toBe("http://localhost:3000");
  });

  it("detects Next.js via next.config.mjs", () => {
    const cwd = mkDir("next-config");
    writePkg(cwd, { scripts: { dev: "next dev" } });
    fs.writeFileSync(path.join(cwd, "next.config.mjs"), "export default {}", "utf8");
    expect(detectProject(cwd).kind).toBe("next");
  });

  it("detects Vite via vite.config.ts", () => {
    const cwd = mkDir("vite-config");
    writePkg(cwd, { scripts: { dev: "vite" } });
    fs.writeFileSync(path.join(cwd, "vite.config.ts"), "export default {}", "utf8");
    const result = detectProject(cwd);
    expect(result.kind).toBe("vite");
    expect(result.suggestedUrl).toBe("http://localhost:5173");
  });

  it("detects generic Node project with scripts.dev", () => {
    const cwd = mkDir("node-dev");
    writePkg(cwd, { scripts: { dev: "node server.js" } });
    const result = detectProject(cwd);
    expect(result.kind).toBe("node");
    expect(result.suggestedCommand).toBe("npm run dev");
    expect(result.suggestedUrl).toBeNull();
  });

  it("detects package manager from lockfiles", () => {
    const pnpmDir = mkDir("pnpm");
    writePkg(pnpmDir, { scripts: { dev: "vite" } });
    fs.writeFileSync(path.join(pnpmDir, "pnpm-lock.yaml"), "lockfileVersion: 6\n", "utf8");
    expect(detectProject(pnpmDir).packageManager).toBe("pnpm");

    const yarnDir = mkDir("yarn");
    writePkg(yarnDir, { scripts: { dev: "vite" } });
    fs.writeFileSync(path.join(yarnDir, "yarn.lock"), "# yarn lockfile\n", "utf8");
    expect(detectProject(yarnDir).packageManager).toBe("yarn");

    const npmDir = mkDir("npm");
    writePkg(npmDir, { scripts: { dev: "vite" } });
    fs.writeFileSync(path.join(npmDir, "package-lock.json"), "{}", "utf8");
    expect(detectProject(npmDir).packageManager).toBe("npm");

    const bunDir = mkDir("bun");
    writePkg(bunDir, { scripts: { dev: "vite" } });
    fs.writeFileSync(path.join(bunDir, "bun.lock"), "{}", "utf8");
    expect(detectProject(bunDir).packageManager).toBe("bun");
  });

  it("detectPreviewWorkspace assigns root Vite to web and child Expo to mobile", () => {
    const root = mkDir("monorepo");
    writePkg(root, {
      devDependencies: { vite: "5.0.0" },
      scripts: { dev: "vite" },
    });
    fs.writeFileSync(path.join(root, "vite.config.ts"), "export default {}", "utf8");

    const mobileDir = path.join(root, "mobile-app");
    fs.mkdirSync(mobileDir);
    writePkg(mobileDir, {
      dependencies: { expo: "51.0.0" },
      scripts: { start: "expo start" },
    });

    const layout = detectPreviewWorkspace(root);
    expect(layout.web?.kind).toBe("vite");
    expect(layout.web?.cwd).toBe(root);
    expect(layout.mobile?.kind).toBe("expo");
    expect(layout.mobile?.cwd).toBe(mobileDir);
  });

  it("prefers root match before scanning child directories", () => {
    const root = mkDir("root-priority");
    writePkg(root, {
      dependencies: { next: "14.0.0" },
      scripts: { dev: "next dev" },
    });

    const child = path.join(root, "apps-web");
    fs.mkdirSync(child);
    writePkg(child, {
      devDependencies: { vite: "5.0.0" },
      scripts: { dev: "vite" },
    });
    fs.writeFileSync(path.join(child, "vite.config.ts"), "export default {}", "utf8");

    const layout = detectPreviewWorkspace(root);
    expect(layout.web?.kind).toBe("next");
    expect(layout.web?.cwd).toBe(root);
  });

  it("describeMissingPreview does not demand package.json for a single simple file", () => {
    const root = mkDir("just-txt");
    fs.writeFileSync(path.join(root, "hello.txt"), "Hello", "utf8");
    expect(describeMissingPreview("web", root)).not.toMatch(/Missing package\.json/);
    expect(describeMissingPreview("web", root)).toMatch(/simple files/i);
  });

  it("describeMissingPreview explains empty folders instead of caval.jsonc", () => {
    const root = mkDir("no-app");
    expect(describeMissingPreview("web", root)).toMatch(/Missing package\.json/);
    expect(describeMissingPreview("web", root)).not.toMatch(/No preview command detected/);
  });

  it("describeMissingPreview keeps command-detection wording when package.json exists", () => {
    const root = mkDir("pkg-only");
    writePkg(root, { name: "x" });
    expect(describeMissingPreview("web", root)).toMatch(/No preview command detected for web/);
  });
});
