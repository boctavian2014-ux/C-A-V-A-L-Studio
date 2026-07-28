import { describe, expect, it } from "vitest";
import {
  resolveUniqueDesktopDir,
  slugifyProjectName,
} from "../../src/main/desktop-project";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("desktop-project", () => {
  it("slugifyProjectName sanitizes titles", () => {
    expect(slugifyProjectName("Senzor aer ESP32!")).toBe("Senzor-aer-ESP32");
    expect(slugifyProjectName("  ")).toBe("Cavallo-Project");
    expect(slugifyProjectName("cățeluș jucărie")).toMatch(/catelus|Cavallo/i);
  });

  it("resolveUniqueDesktopDir appends -2 when taken", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "caval-desk-"));
    const first = resolveUniqueDesktopDir(tmp, "Demo");
    fs.mkdirSync(first);
    const second = resolveUniqueDesktopDir(tmp, "Demo");
    expect(second).toBe(path.join(tmp, "Demo-2"));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
