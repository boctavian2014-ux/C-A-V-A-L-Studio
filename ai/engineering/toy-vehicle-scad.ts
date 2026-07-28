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

  const bodyLen = sports ? 150 : 140;
  const bodyW = sports ? 58 : 62;
  const bodyH = sports ? 22 : 26;
  const cabinLen = sports ? 48 : 55;
  const cabinW = sports ? 42 : 48;
  const cabinH = sports ? 20 : 24;
  const hoodX = sports ? 8 : 0;
  const cabinX = sports ? -6 : -4;

  const sportsExtras = sports
    ? `
  // Rear spoiler
  translate([-body_len / 2 + 14, 0, body_h + 10])
    cube([6, body_w * 0.92, 3], center = true);
  // Hood bulge
  translate([body_len * 0.22, 0, body_h + 2])
    cube([body_len * 0.28, body_w * 0.7, 6], center = true);
`
    : "";

  return `// Deterministic toy car — solid body (NOT a hollow bathtub)
// Request: ${label}
$fn = 64;

body_len = ${bodyLen};
body_w  = ${bodyW};
body_h  = ${bodyH};
cabin_len = ${cabinLen};
cabin_w   = ${cabinW};
cabin_h   = ${cabinH};
wheel_d = 28;
wheel_w = 12;
axle_z  = 14;
track   = body_w / 2 + 4;
wb_front = body_len * 0.28;
wb_rear  = body_len * 0.30;

module solid_body() {
  // Lower chassis — CLOSED solid (no difference / no open tub)
  hull() {
    translate([0, 0, 10])
      cube([body_len, body_w, 18], center = true);
    translate([${hoodX}, 0, 16])
      cube([body_len * 0.72, body_w * 0.88, 10], center = true);
  }
  // Cabin — solid, sits ON the body
  translate([${cabinX}, 0, body_h + cabin_h / 2 - 2])
    hull() {
      cube([cabin_len, cabin_w, cabin_h], center = true);
      translate([cabin_len * 0.18, 0, -cabin_h * 0.15])
        cube([cabin_len * 0.7, cabin_w * 0.92, cabin_h * 0.7], center = true);
    }
${sportsExtras}
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
