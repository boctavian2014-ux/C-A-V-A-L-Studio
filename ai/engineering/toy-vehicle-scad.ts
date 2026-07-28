/**
 * Shared toy / sports-car OpenSCAD — solid body (never a hollow bathtub).
 * Used by CAD server + renderer so vehicle jobs do not depend on Trellis/LLM.
 */

export function isToyVehiclePrompt(prompt: string): boolean {
  return /(mașin[aăi]|masina|masini|toy\s*car|diecast|vehicle|camion|truck|tractor|buldozer|buggy|kart|automobil|ferrari|porsche|lamborghini|sports?\s*car|coupe|sedan|hot\s*wheels|mașinu[tț][aă]|masinuta)/iu.test(
    prompt
  );
}

export function buildToyVehicleScad(prompt: string): string {
  const sports =
    /(ferrari|porsche|lamborghini|sports?\s*car|coupe|hot\s*wheels)/iu.test(prompt);
  const label = prompt.slice(0, 80).replace(/"/g, "'");

  if (sports) {
    return buildSportsCoupeScad(label);
  }
  return buildGenericToyCarScad(label);
}

/** Low sports coupe silhouette — solid primitives only (no open tub). */
function buildSportsCoupeScad(label: string): string {
  return `// Deterministic sports coupe — solid body (NOT a hollow bathtub)
// Request: ${label}
$fn = 48;

body_len = 160;
body_w   = 62;
wheel_d  = 30;
wheel_w  = 14;
axle_z   = 15;
track    = body_w / 2 + 5;
wb_f     = 48;
wb_r     = -46;

module tire() {
  rotate([90, 0, 0]) {
    cylinder(h = wheel_w, d = wheel_d, center = true);
    // rim dish
    cylinder(h = wheel_w * 0.35, d = wheel_d * 0.55, center = true);
  }
}

module fender(x) {
  translate([x, 0, axle_z + 2])
    hull() {
      translate([0, -track + 2, 0]) scale([1.15, 0.55, 0.85]) sphere(d = wheel_d * 1.05);
      translate([0,  track - 2, 0]) scale([1.15, 0.55, 0.85]) sphere(d = wheel_d * 1.05);
    }
}

module sports_body() {
  // —— Floor / rocker (wide, low) ——
  hull() {
    translate([0, 0, 8])
      cube([body_len * 0.92, body_w, 10], center = true);
    translate([8, 0, 11])
      cube([body_len * 0.78, body_w * 0.94, 8], center = true);
  }

  // —— Front nose (long, tapered Ferrari-style) ——
  translate([body_len * 0.18, 0, 6])
    rotate([0, 0, 0])
      hull() {
        translate([0, 0, 4])
          cube([42, body_w * 0.88, 10], center = true);
        translate([28, 0, 2])
          cube([18, body_w * 0.55, 6], center = true);
        translate([38, 0, 1])
          cube([8, body_w * 0.28, 4], center = true);
      }

  // —— Hood bulge / power dome ——
  translate([22, 0, 16])
    hull() {
      cube([36, body_w * 0.62, 6], center = true);
      translate([8, 0, 2])
        cube([18, body_w * 0.42, 5], center = true);
    }

  // —— Cabin / canopy (raked windshield) ——
  translate([-8, 0, 18])
    hull() {
      // base of cabin
      translate([4, 0, 0])
        cube([52, body_w * 0.72, 6], center = true);
      // roof peak, shifted rearward
      translate([-6, 0, 14])
        cube([28, body_w * 0.58, 4], center = true);
      // rear backlight slope
      translate([-22, 0, 6])
        cube([16, body_w * 0.62, 5], center = true);
      // windshield rake forward-low
      translate([18, 0, 4])
        cube([14, body_w * 0.68, 3], center = true);
    }

  // —— Side air intakes (sculpt) ——
  for (s = [-1, 1])
    translate([-6, s * (body_w * 0.42), 14])
      rotate([0, 0, s * 8])
        cube([28, 6, 10], center = true);

  // —— Rear hips / haunches ——
  translate([-48, 0, 12])
    hull() {
      cube([36, body_w * 1.02, 14], center = true);
      translate([-8, 0, 4])
        cube([20, body_w * 0.95, 10], center = true);
    }

  // —— Diffuser / rear bumper ——
  translate([-72, 0, 6])
    hull() {
      cube([16, body_w * 0.9, 8], center = true);
      translate([-6, 0, -2])
        cube([8, body_w * 0.7, 4], center = true);
    }

  // —— Twin exhaust tips ——
  for (y = [-14, 14])
    translate([-78, y, 5])
      rotate([0, 90, 0])
        cylinder(h = 8, d = 6, center = true);

  // —— Front splitter ——
  translate([68, 0, 3])
    hull() {
      cube([18, body_w * 0.95, 3], center = true);
      translate([8, 0, 0])
        cube([6, body_w * 0.55, 2], center = true);
    }

  // —— Rear wing on stalks ——
  for (y = [-18, 18])
    translate([-58, y, 28])
      cube([3, 3, 14], center = true);
  translate([-56, 0, 36])
    hull() {
      cube([10, body_w * 0.98, 3], center = true);
      translate([-2, 0, 2])
        cube([6, body_w * 0.9, 2], center = true);
    }

  // —— Side mirrors ——
  for (s = [-1, 1])
    translate([6, s * (body_w * 0.42), 22])
      hull() {
        cube([8, 4, 3], center = true);
        translate([0, s * 6, 0])
          cube([6, 3, 2.5], center = true);
      }

  // —— Wheel-arch bulges ——
  fender(wb_f);
  fender(wb_r);
}

module toy_car() {
  sports_body();
  for (x = [wb_f, wb_r])
    for (y = [-track, track])
      translate([x, y, axle_z])
        tire();
}

toy_car();
`;
}

function buildGenericToyCarScad(label: string): string {
  return `// Deterministic toy car — solid body (NOT a hollow bathtub)
// Request: ${label}
$fn = 48;

body_len = 140;
body_w  = 62;
body_h  = 26;
cabin_len = 55;
cabin_w   = 48;
cabin_h   = 24;
wheel_d = 28;
wheel_w = 12;
axle_z  = 14;
track   = body_w / 2 + 4;
wb_front = body_len * 0.28;
wb_rear  = body_len * 0.30;

module solid_body() {
  hull() {
    translate([0, 0, 10])
      cube([body_len, body_w, 18], center = true);
    translate([0, 0, 16])
      cube([body_len * 0.72, body_w * 0.88, 10], center = true);
  }
  translate([-4, 0, body_h + cabin_h / 2 - 2])
    hull() {
      cube([cabin_len, cabin_w, cabin_h], center = true);
      translate([cabin_len * 0.18, 0, -cabin_h * 0.15])
        cube([cabin_len * 0.7, cabin_w * 0.92, cabin_h * 0.7], center = true);
    }
}

module car_wheel() {
  rotate([90, 0, 0])
    cylinder(h = wheel_w, d = wheel_d, center = true);
}

module toy_car() {
  solid_body();
  for (x = [wb_front, -wb_rear])
    for (y = [-track, track])
      translate([x, y, axle_z])
        car_wheel();
}

toy_car();
`;
}
