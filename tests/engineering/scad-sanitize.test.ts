import { describe, expect, it } from "vitest";
import {
  findShadowedBuiltinModules,
  sanitizeScadBuiltinShadows,
  validateScadSource,
} from "../../engineering/cad-server/scad-prompt";

describe("sanitizeScadBuiltinShadows", () => {
  it("renames module hull that would recurse", () => {
    const broken = `
$fn = 64;
module hull() {
  difference() {
    cube([20, 10, 8], center = true);
    hull();
  }
}
hull();
`.trim();

    expect(findShadowedBuiltinModules(broken)).toEqual(["hull"]);
    const fixed = sanitizeScadBuiltinShadows(broken);
    expect(fixed).toContain("module cavallo_hull");
    expect(fixed).toContain("cavallo_hull();");
    expect(fixed).not.toMatch(/\bmodule\s+hull\b/);
    expect(validateScadSource(fixed).ok).toBe(true);
  });

  it("keeps builtin hull() { children } blocks", () => {
    const ok = `
module body() {
  hull() {
    cube([10, 10, 2]);
    translate([20, 0, 0]) cube([10, 10, 2]);
  }
}
body();
`.trim();
    expect(sanitizeScadBuiltinShadows(ok)).toBe(ok);
  });
});
