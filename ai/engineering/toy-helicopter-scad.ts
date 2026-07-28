/**
 * Deterministic toy helicopter OpenSCAD — fuselage + main rotor + tail + skids.
 * Used by CAD server + renderer so heli jobs do not depend on Trellis/LLM wedges.
 */

export function isToyHelicopterPrompt(prompt: string): boolean {
  return /(elicopter|helicopter|\bheli\b|elicopter(?:e|ul)?|chopper)/iu.test(prompt);
}

export function buildToyHelicopterScad(prompt: string): string {
  const label = prompt.slice(0, 80).replace(/"/g, "'");
  return `// Deterministic toy helicopter — solid parts (NOT a single wedge/box)
// Request: ${label}
$fn = 48;

fuselage_len = 110;
fuselage_w   = 36;
fuselage_h   = 28;
cabin_len    = 42;
cabin_w      = 40;
cabin_h      = 32;
boom_len     = 70;
boom_d       = 10;
blade_len    = 55;
blade_w      = 10;
blade_h      = 3;
skid_len     = 90;
skid_d       = 6;
mast_h       = 22;

module fuselage() {
  hull() {
    translate([-10, 0, 14])
      cube([fuselage_len * 0.7, fuselage_w, fuselage_h], center = true);
    translate([38, 0, 12])
      cube([28, fuselage_w * 0.55, fuselage_h * 0.7], center = true);
  }
  translate([8, 0, fuselage_h + 4])
    hull() {
      cube([cabin_len, cabin_w * 0.85, cabin_h * 0.55], center = true);
      translate([6, 0, 8])
        cube([cabin_len * 0.55, cabin_w * 0.7, 10], center = true);
    }
}

module tail_boom() {
  translate([-fuselage_len * 0.45 - boom_len / 2, 0, 18])
    rotate([0, 90, 0])
      cylinder(h = boom_len, r = boom_d / 2, center = true);
  translate([-fuselage_len * 0.45 - boom_len + 6, 0, 28])
    cube([8, 3, 22], center = true);
  translate([-fuselage_len * 0.45 - boom_len + 4, 12, 22])
    rotate([90, 0, 0])
      cylinder(h = 3, r = 14, center = true);
  for (a = [0, 90])
    translate([-fuselage_len * 0.45 - boom_len + 4, 12, 22])
      rotate([0, 0, a])
        cube([26, 4, 2], center = true);
}

module main_rotor() {
  translate([0, 0, fuselage_h + mast_h]) {
    translate([0, 0, -mast_h / 2])
      cylinder(h = mast_h, r = 4, center = true);
    cylinder(h = 8, r = 8, center = true);
    for (a = [0, 90])
      rotate([0, 0, a])
        translate([blade_len / 2 + 4, 0, 0])
          cube([blade_len, blade_w, blade_h], center = true);
  }
}

module landing_skids() {
  for (s = [-1, 1]) {
    translate([0, s * 22, 3])
      rotate([0, 90, 0])
        cylinder(h = skid_len, r = skid_d / 2, center = true);
    hull() {
      translate([20, s * 14, 10]) cube([5, 5, 5], center = true);
      translate([20, s * 22, 3]) cube([5, 5, 5], center = true);
    }
    hull() {
      translate([-20, s * 14, 10]) cube([5, 5, 5], center = true);
      translate([-20, s * 22, 3]) cube([5, 5, 5], center = true);
    }
  }
}

module toy_helicopter() {
  fuselage();
  tail_boom();
  main_rotor();
  landing_skids();
}

toy_helicopter();
`;
}
