import { describe, expect, it } from "vitest";
import {
  formatCadDualHealth,
  formatCadDualHealthOneLine,
} from "../../ai/engineering/cad-dual-health";

describe("cad dual health", () => {
  it("reports offline as err", () => {
    const r = formatCadDualHealth({
      localOpenRouter: true,
      localPiapi: true,
      cloudOk: false,
    });
    expect(r.tone).toBe("err");
    expect(r.text).toMatch(/offline/i);
    expect(r.text).not.toMatch(/https?:\/\//);
  });

  it("ok when local + cloud keys and OpenSCAD", () => {
    const r = formatCadDualHealth({
      localOpenRouter: true,
      localPiapi: true,
      cloudOk: true,
      cloudOpenRouter: true,
      cloudPiapi: true,
      openscadInstalled: true,
    });
    expect(r.tone).toBe("ok");
    expect(r.text).toContain("Local OR✓ PiAPI✓");
    expect(r.text).toContain("Cloud OR✓ PiAPI✓");
    expect(r.text).not.toMatch(/https?:\/\//);
  });

  it("warns when cloud env missing", () => {
    const r = formatCadDualHealthOneLine({
      localOpenRouter: true,
      localPiapi: true,
      cloudOk: true,
      cloudOpenRouter: false,
      cloudPiapi: false,
      openscadInstalled: true,
    });
    expect(r.tone).toBe("warn");
    expect(r.text).toBe("Local OR✓ PiAPI✓ · Cloud OR✗ PiAPI✗ · OpenSCAD✓");
  });
});
