import { afterEach, describe, expect, it } from "vitest";
import {
  renderScadToStl,
  resetOpenScadProbeCacheForTests,
  setOpenScadBinaryForTests,
} from "../../engineering/cad-server/scad-runner";

describe("scad-runner", () => {
  afterEach(() => {
    resetOpenScadProbeCacheForTests();
  });

  it("renders a simple cube to STL when OpenSCAD is installed", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    try {
      await execFileAsync("openscad", ["--version"], { timeout: 5000 });
    } catch {
      return;
    }
    const result = await renderScadToStl("cube(10);", "test-cube");
    expect(result.ok).toBe(true);
    expect(result.stlBuffer?.length).toBeGreaterThan(80);
  }, 30_000);

  it("reports missing OpenSCAD gracefully without depending on local PATH installs", async () => {
    setOpenScadBinaryForTests(null);
    const result = await renderScadToStl("cube(10);", "missing-cli");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/OpenSCAD nu e instalat|not installed|ENOENT/i);
  });
});
