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

  it("calls every persistent-process shutdown synchronously before app.quit()", () => {
    const preview = indexOfCall(body, "shutdownAllPreviewSync");
    const terminal = indexOfCall(body, "stopAllInteractiveTerminalsSync");
    const tasks = indexOfCall(body, "shutdownAllTasksSync");
    const cad = indexOfCall(body, "stopCadLocalServer");
    const marketplace = indexOfCall(body, "stopMarketplaceServer");
    const quit = indexOfCall(body, "app.quit");
    expect(preview).toBeLessThan(terminal);
    expect(terminal).toBeLessThan(tasks);
    expect(tasks).toBeLessThan(cad);
    expect(cad).toBeLessThan(marketplace);
    expect(marketplace).toBeLessThan(quit);
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
