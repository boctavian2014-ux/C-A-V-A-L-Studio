import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { stopCadLocalServer } from "../../src/main/cad-local-server";
import { stopMarketplaceServer } from "../../src/main/marketplace-server";

const ELECTRON_MAIN = path.resolve(__dirname, "../../src/main/electron-main.ts");

function extractHandler(source: string, eventName: string): string {
  const marker = new RegExp(`app\\.on\\(\\s*["']${eventName}["']`);
  const start = source.search(marker);
  if (start < 0) {
    throw new Error(`Missing app.on("${eventName}")`);
  }
  const open = source.indexOf("{", start);
  if (open < 0) {
    throw new Error(`Missing body for app.on("${eventName}")`);
  }
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open, i + 1);
      }
    }
  }
  throw new Error(`Unclosed body for app.on("${eventName}")`);
}

function indexOfCall(body: string, name: string): number {
  const idx = body.indexOf(`${name}(`);
  if (idx < 0) {
    throw new Error(`Missing ${name}() in window-all-closed`);
  }
  return idx;
}

describe("electron-main window-all-closed lifecycle", () => {
  const source = fs.readFileSync(ELECTRON_MAIN, "utf8");
  const body = extractHandler(source, "window-all-closed");

  it("does not fire-and-forget any service with void", () => {
    expect(body).not.toMatch(/\bvoid\s+/);
  });

  it("does not defer cleanup with setTimeout or setImmediate", () => {
    expect(body).not.toMatch(/\bsetTimeout\b/);
    expect(body).not.toMatch(/\bsetImmediate\b/);
  });

  it("delegates native teardown to the central shutdown path, then app.quit()", () => {
    expect(source).toContain("installAppShutdownLifecycle");
    expect(body).toContain('shutdownMark("window-all-closed")');
    expect(body).not.toContain("closeAllAiPersistence");
    expect(body).not.toContain("stopManagedOllamaIfStarted");
    expect(body).not.toContain("shutdownAllPreviewSync");
    expect(body).not.toContain("stopAllInteractiveTerminalsSync");
    expect(body).not.toContain("shutdownAllTasksSync");
    expect(body).not.toContain("stopCadLocalServer");
    expect(body).not.toContain("stopMarketplaceServer");
    const quit = indexOfCall(body, "app.quit");
    expect(quit).toBeGreaterThan(body.indexOf("window-all-closed"));
  });

  it("does not close sqlite from the smoke timer (before-quit owns teardown)", () => {
    expect(source).not.toMatch(
      /isElectronSmokeMode[\s\S]{0,800}closeAllAiPersistence/
    );
  });

  it("does not keep a stale spawn terminals map beside InteractiveTerminalService", () => {
    expect(source).not.toMatch(/const terminals = new Map/);
    expect(body).not.toMatch(/terminals\.values\s*\(/);
    expect(source).not.toMatch(/caval:terminal-start/);
    expect(source).not.toMatch(/caval:terminal-stop/);
  });

  it("CAD and marketplace shutdown functions are synchronous", () => {
    expect(stopCadLocalServer()).toBeUndefined();
    expect(stopMarketplaceServer()).toBeUndefined();
  });
});

describe("electron-main window chrome", () => {
  const source = fs.readFileSync(ELECTRON_MAIN, "utf8");

  it("applies dark native chrome and graphite window background", () => {
    expect(source).toContain("applyNativeWindowChrome");
    expect(source).toContain("browserWindowChromeOptions");
    expect(source).toContain("hideNativeMenuBar");
    expect(source).not.toMatch(/backgroundColor:\s*"#090B12"/);
  });
});

describe("electron-main bound workspace (P0.1)", () => {
  const source = fs.readFileSync(ELECTRON_MAIN, "utf8");

  it("never falls back to process.cwd() as a bound workspace root", () => {
    expect(source).not.toMatch(/workspaceRoots\.get\([^)]+\)\s*\?\?\s*process\.cwd\(\)/);
    expect(source).not.toMatch(/registerModelHandlers\(\s*\([^)]*\)\s*=>\s*workspaceRoots\.get/);
  });

  it("renderer-ready skips cwd and does not auto-bind the launch directory", () => {
    const start = source.indexOf('ipcMain.on("caval:renderer-ready"');
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, start + 650);
    expect(body).toContain("peekBoundWorkspaceRoot");
    expect(body).toContain("caval:workspace-unbound");
    expect(body).toContain("workspaceRoot: null");
    expect(body).not.toMatch(/process\.cwd\(\)/);
    expect(body).toContain("sendWorkspaceToRenderer");
  });
});

describe("model-handlers bound workspace (P0.1)", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../src/main/model-handlers.ts"),
    "utf8"
  );

  it("does not default the workspace getter to process.cwd()", () => {
    expect(source).not.toMatch(/=\s*\(\)\s*=>\s*process\.cwd\(\)/);
    expect(source).toContain("resolveRequiredBoundWorkspace");
  });

  it("refuses streamToRenderer before tracking or fetching when unbound", () => {
    const start = source.indexOf("async function streamToRenderer");
    const body = source.slice(start, start + 900);
    expect(body.indexOf("resolveRequiredBoundWorkspace")).toBeGreaterThan(0);
    expect(body.indexOf("resolveRequiredBoundWorkspace")).toBeLessThan(body.indexOf("trackActiveStream"));
  });
});
