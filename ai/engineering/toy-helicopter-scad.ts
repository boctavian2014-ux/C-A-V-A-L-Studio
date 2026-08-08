/**
 * Deterministic toy helicopter OpenSCAD — detailed solid (fuselage, cabin, long rotors, skids).
 * Same prompt routing forever: isToyHelicopterPrompt → library template (no Trellis/LLM).
 */

export function isToyHelicopterPrompt(prompt: string): boolean {
  return /(elicopter|helicopter|\bheli\b|elicopter(?:e|ul)?|chopper)/iu.test(prompt);
}

export function buildToyHelicopterScad(prompt: string): string {
  const label = prompt.slice(0, 80).replace(/"/g, "'");
  return `// Deterministic toy helicopter — detailed solid (NOT a single wedge/box)
// Request: ${label}
// Library template — prompt "elicopter" / "helicopter" always uses this path.
$fn = 48;

fuselage_len = 120;
fuselage_w   = 38;
fuselage_h   = 30;
cabin_len    = 52;
cabin_w      = 44;
cabin_h      = 38;
boom_len     = 78;
boom_d       = 9;
blade_len    = 78;
blade_w      = 12;
blade_h      = 3.5;
skid_len     = 100;
skid_d       = 6;
mast_h       = 28;
track        = 26;

module fuselage() {
  // Lower body — tapered nose, wider mid, tapered rear
  hull() {
    translate([42, 0, 12])
      cube([22, fuselage_w * 0.42, 16], center = true);
    translate([10, 0, 15])
      cube([50, fuselage_w * 0.92, fuselage_h], center = true);
    translate([-28, 0, 16])
      cube([36, fuselage_w * 0.78, fuselage_h * 0.9], center = true);
  }
  // Belly fairing
  translate([4, 0, 4])
    hull() {
      cube([70, fuselage_w * 0.7, 8], center = true);
      translate([0, 0, -2])
        cube([55, fuselage_w * 0.45, 4], center = true);
    }
}

module cabin() {
  // Glasshouse / cabin bubble sitting on fuselage
  translate([14, 0, fuselage_h + 2]) {
    hull() {
      // Floor of cabin
      translate([-4, 0, -2])
        cube([cabin_len * 0.95, cabin_w * 0.92, 6], center = true);
      // Roof
      translate([-8, 0, cabin_h * 0.42])
        cube([cabin_len * 0.72, cabin_w * 0.72, 5], center = true);
      // Windshield rake (forward-low)
      translate([18, 0, 6])
        cube([14, cabin_w * 0.78, 8], center = true);
      // Rear bulkhead
      translate([-24, 0, 8])
        cube([10, cabin_w * 0.82, 18], center = true);
    }
    // Side window panels (solid toy style)
    for (s = [-1, 1])
      translate([-2, s * (cabin_w * 0.42), 10])
        cube([28, 3, 16], center = true);
    // Door step / rails
    for (s = [-1, 1])
      translate([6, s * (cabin_w * 0.48), 0])
        cube([20, 3, 4], center = true);
  }
}

module tail_boom() {
  boom_x = -fuselage_len * 0.42 - boom_len / 2;
  translate([boom_x, 0, 18])
    rotate([0, 90, 0])
      cylinder(h = boom_len, r = boom_d / 2, center = true);
  // Boom fairing at root
  translate([-fuselage_len * 0.38, 0, 18])
    hull() {
      cube([18, 16, 14], center = true);
      translate([-14, 0, 0])
        cube([8, 10, 10], center = true);
    }
  // Vertical stabilizer
  translate([boom_x - boom_len / 2 + 8, 0, 30])
    hull() {
      cube([10, 3.5, 28], center = true);
      translate([-4, 0, 8])
        cube([6, 3, 14], center = true);
    }
  // Horizontal stabilizer
  translate([boom_x - boom_len / 2 + 10, 0, 22])
    cube([8, 36, 3], center = true);
  // Tail rotor hub + long blades
  translate([boom_x - boom_len / 2 + 6, 14, 24]) {
    rotate([90, 0, 0])
      cylinder(h = 4, r = 6, center = true);
    for (a = [0, 90])
      rotate([0, 0, a])
        cube([34, 5, 2.5], center = true);
  }
}

module main_rotor() {
  translate([2, 0, fuselage_h + mast_h + 8]) {
    // Mast
    translate([0, 0, -mast_h / 2 - 4])
      cylinder(h = mast_h + 8, r = 4.5, center = true);
    // Swash / hub
    cylinder(h = 10, r = 11, center = true);
    translate([0, 0, 6])
      cylinder(h = 4, r = 7, center = true);
    // Four long main blades
    for (a = [0, 90, 180, 270])
      rotate([0, 0, a])
        translate([blade_len / 2 + 8, 0, 0])
          hull() {
            cube([blade_len, blade_w, blade_h], center = true);
            translate([blade_len * 0.42, 0, 0])
              cube([8, blade_w * 0.55, blade_h * 0.8], center = true);
          }
  }
}

module landing_skids() {
  for (s = [-1, 1]) {
    // Skid tube
    translate([4, s * track, 3])
      rotate([0, 90, 0])
        cylinder(h = skid_len, r = skid_d / 2, center = true);
    // Tip caps
    translate([4 + skid_len / 2, s * track, 3])
      sphere(r = skid_d / 2 + 0.5);
    translate([4 - skid_len / 2, s * track, 3])
      sphere(r = skid_d / 2 + 0.5);
    // Front strut
    hull() {
      translate([24, s * 16, 12]) cube([6, 5, 5], center = true);
      translate([24, s * track, 4]) cube([6, 5, 5], center = true);
    }
    // Rear strut
    hull() {
      translate([-18, s * 16, 12]) cube([6, 5, 5], center = true);
      translate([-18, s * track, 4]) cube([6, 5, 5], center = true);
    }
  }
  // Cross braces
  translate([24, 0, 3])
    cube([5, track * 2, 4], center = true);
  translate([-18, 0, 3])
    cube([5, track * 2, 4], center = true);
}

module toy_helicopter() {
  fuselage();
  cabin();
  tail_boom();
  main_rotor();
  landing_skids();
}

toy_helicopter();
`;
}
