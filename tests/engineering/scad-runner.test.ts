import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { renderScadToStl } from "../../engineering/cad-server/scad-runner";

const execFileAsync = promisify(execFile);

const openscadAvailable = async (): Promise<boolean> => {
  try {
    await execFileAsync("openscad", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

describe("scad-runner", () => {
  it("renders a simple cube to STL when OpenSCAD is installed", async () => {
    if (!(await openscadAvailable())) {
      return;
    }
    const result = await renderScadToStl("cube(10);", "test-cube");
    expect(result.ok).toBe(true);
    expect(result.stlBuffer?.length).toBeGreaterThan(80);
  }, 30_000);

  it("reports missing OpenSCAD gracefully", async () => {
    const prev = process.env.PATH;
    process.env.PATH = "";
    const result = await renderScadToStl("cube(10);", "missing-cli");
    process.env.PATH = prev;
    if (await openscadAvailable()) {
      expect(result.ok).toBe(true);
    } else {
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not installed|ENOENT/i);
    }
  });
});
