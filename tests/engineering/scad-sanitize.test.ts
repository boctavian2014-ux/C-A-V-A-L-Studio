import { describe, expect, it } from "vitest";
import {
  findShadowedBuiltinModules,
  sanitizeScadBuiltinShadows,
  validateScadMatchesIntent,
  validateScadSource,
} from "../../engineering/cad-server/scad-prompt";
import {
  buildToyVehicleScad,
  isToyVehiclePrompt,
} from "../../ai/engineering/toy-vehicle-scad";

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

import {
  buildToyVehicleScad,
  isToyVehiclePrompt,
} from "../../ai/engineering/toy-vehicle-scad";

describe("toy vehicle template", () => {
  it("detects Ferrari / masina prompts", () => {
    expect(isToyVehiclePrompt("masina ferrari jucarie")).toBe(true);
    expect(isToyVehiclePrompt("a dog figurine")).toBe(false);
  });

  it("builds solid sports-car SCAD with wheels and no hollow tub", () => {
    const scad = buildToyVehicleScad("masina ferrari jucarie");
    expect(scad).toMatch(/sports_body|toy_car/);
    expect(scad.toLowerCase()).toMatch(/hood|wing|splitter|fender/);
    expect(scad.toLowerCase()).toContain("not a hollow bathtub");
    expect(scad).not.toMatch(/\bdifference\s*\(/);
    expect(validateScadSource(scad).ok).toBe(true);
    expect(validateScadMatchesIntent("ferrari toy car", scad).ok).toBe(true);
  });

  it("rejects bathtub-with-wheels OpenSCAD", () => {
    const tub = `
$fn=64;
difference() {
  cube([170,80,70], center=true);
  translate([0,0,10]) cube([150,60,70], center=true);
}
translate([40,45,0]) rotate([90,0,0]) cylinder(h=12,d=28,center=true);
translate([-40,45,0]) rotate([90,0,0]) cylinder(h=12,d=28,center=true);
translate([40,-45,0]) rotate([90,0,0]) cylinder(h=12,d=28,center=true);
translate([-40,-45,0]) rotate([90,0,0]) cylinder(h=12,d=28,center=true);
`;
    const check = validateScadMatchesIntent("masina ferrari jucarie", tub);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/bathtub|SOLID/i);
  });
});

import {
  buildToyHelicopterScad,
  isToyHelicopterPrompt,
} from "../../ai/engineering/toy-helicopter-scad";

describe("toy helicopter template", () => {
  it("detects elicopter prompts", () => {
    expect(isToyHelicopterPrompt("elicopter de jucarie")).toBe(true);
    expect(isToyHelicopterPrompt("toy helicopter")).toBe(true);
    expect(isToyHelicopterPrompt("masina ferrari")).toBe(false);
  });

  it("builds heli with fuselage, rotor, boom, skids", () => {
    const scad = buildToyHelicopterScad("elicopter de jucarie");
    expect(scad).toMatch(/toy_helicopter|fuselage|main_rotor|landing_skids|tail_boom/);
    expect(scad.toLowerCase()).toContain("not a single wedge");
    expect(validateScadSource(scad).ok).toBe(true);
    expect(validateScadMatchesIntent("elicopter de jucarie", scad).ok).toBe(true);
  });
});
