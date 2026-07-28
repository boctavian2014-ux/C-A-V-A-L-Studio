import type { CadChatMessage, CadConstraints, CadPlanContext, CadQuality } from "./types";

const PROJECT_CAD_GUIDANCE: Record<string, string> = {
  drone:
    "Drone parts: motor mounts, prop guards, landing gear, battery trays, camera mounts, antenna holders, frame plates, arms. For propellers use rotate_extrude blade profile or twisted extrude — NOT a plain hollow cylinder unless user asked for a cap. NEVER output a hollow rectangular cabinet/wardrobe/box when user asked for a drone — model a frame plate, arm, or mount instead.",
  robot:
    "Robot parts: wheels (hub + tire profile via rotate_extrude), chassis plates, encoder mounts, LiDAR brackets, gear holders. Wheels need hub bore, tire outer diameter, and tread.",
  vehicle:
    "Toy/vehicle parts: car body or chassis with cabin/hood silhouette, wheel wells, 4 wheels with axles. NEVER output a cabinet, wardrobe, drawer unit, or hollow furniture box when user asked for a car/mașină/toy vehicle.",
  helicopter:
    "Toy helicopter: fuselage/cabin, main rotor (hub + blades), tail boom + tail rotor, landing skids. NEVER a single rectangular prism, wedge, or cabinet. Use multiple modules and cylinders.",
  iot:
    "IoT/sensor enclosures: MUST include feature-specific cutouts from the request (OLED window, vent slots, buzzer hole, USB port, antenna clearance). PCB standoffs M2.5, wall thickness 2 mm, two-part base+lid. NEVER output a featureless rectangular box when user mentioned display, sensor, WiFi, or alert.",
  cnc:
    "CNC parts: spindle mounts, limit-switch brackets, cable chains, control panel bezels, extrusion adapters.",
  custom:
    "Match the user's described geometry precisely. Use parametric modules and meaningful variable names. NEVER substitute an unrelated object (e.g. cabinet) for what the user asked.",
};

const PART_KEYWORD_HINTS: Array<{ pattern: RegExp; hint: string }> = [
  {
    pattern: /(elicopter|helicopter|\bheli\b)/iu,
    hint: "Design a TOY HELICOPTER: fuselage/cabin, main rotor hub+blades, tail boom + tail rotor, landing skids. NOT a plain box or wedge.",
  },
  {
    pattern: /(mașin[aăi]|masina|toy\s*car|diecast|vehicle|camion|truck|tractor|automobil|ferrari|porsche|lamborghini|sports?\s*car|coupe|jucăr(?:ie|ii))/iu,
    hint: "Design a TOY SPORTS/CAR: SOLID closed body (chassis+cabin hull, NO hollow bathtub cavity), optional spoiler, 4 wheel cylinders with axles. FORBIDDEN: difference() scooping the body into an open tub/basin; furniture; drawers.",
  },
  {
    pattern: /(roata|roată|wheel|tire|anvelopă|anvelopa)/iu,
    hint: "Design a WHEEL: hub cylinder + tire (rotate_extrude torus-like profile or rounded outer ring), optional spokes. Include bore diameter and width parameters.",
  },
  {
    pattern: /(elice|propeller|prop|helice)/iu,
    hint: "Design a PROPELLER: 2–4 blades with rotate_extrude or linear_extrude twisted airfoil, central hub with motor bore.",
  },
  {
    pattern: /(angrenaj|gear|pinion)/iu,
    hint: "Design a GEAR: use rotate_extrude tooth profile or simplified involute approximation with tooth count, module/pitch, bore.",
  },
  {
    pattern: /(suport telefon|phone stand|phone holder|incarcare wireless|wireless charging)/iu,
    hint: "Design a PHONE STAND/HOLDER: angled phone slot, stable base, cable channel, optional Qi coil recess and ESP32/PCB bay — NOT a generic empty box.",
  },
  {
    pattern: /(ciocan|hammer|mjolnir|thor)/iu,
    hint: "Design a HAMMER PROP: rectangular head + cylindrical handle + pommel. NOT furniture, NOT drawers/sertare, NOT a cabinet.",
  },
  {
    pattern: /(bracket|suport|mount|prindere)/iu,
    hint: "Design a BRACKET: L or U shape with mounting holes, ribbing, screw countersinks.",
  },
  {
    pattern: /(enclosure|carcase|capac|cutie|case)/iu,
    hint: "Design an ENCLOSURE: box with wall thickness, lid lip, standoffs, ventilation slots if needed.",
  },
  {
    pattern: /(oled|ecran|display|0\.96)/iu,
    hint: "Include OLED DISPLAY WINDOW: rectangular cutout ~27.3×27.3 mm on front face with 2 mm bezel recess — visible opening, not solid plastic.",
  },
  {
    pattern: /(senzor.*aer|calitate.*aer|air quality|pm2\.?5|pms5003|sgp30|voc)/iu,
    hint: "AIR QUALITY SENSOR ENCLOSURE: side ventilation grille (slots or perforations) for airflow to sensor module — NOT sealed walls.",
  },
  {
    pattern: /(wifi|esp32|wireless|alert|alertă|buzzer)/iu,
    hint: "IoT ALERT DEVICE: thin antenna wall or cutout for ESP32 WiFi; buzzer hole Ø12 mm; optional LED hole Ø5 mm.",
  },
];

function keywordHints(prompt: string): string[] {
  return PART_KEYWORD_HINTS.filter(({ pattern }) => pattern.test(prompt)).map(({ hint }) => hint);
}

const FDM_PRINT_RULES = [
  "FDM 3D PRINTING RULES:",
  "- Millimeters only. $fn >= 64 for curved surfaces (128 for high quality).",
  "- Minimum wall thickness 1.2 mm; prefer 1.6 mm for structural parts.",
  "- No zero-thickness walls, no non-manifold gaps, single watertight solid.",
  "- Screw holes: nominal diameter + 0.2 mm clearance for M3/M4/M5.",
  "- Parametric variables at top (all key dimensions editable).",
  "- Avoid extreme overhangs >45° without chamfer or support-friendly geometry.",
  "- Flat bottom face for bed adhesion when possible.",
];

function fdmRulesForQuality(quality?: CadQuality): string[] {
  if (quality === "high") {
    return [
      ...FDM_PRINT_RULES,
      "- HIGH QUALITY: finer detail, more ribs/braces, countersunk screw pockets, fillets on stress points.",
      "- Use $fn = 128 on visible curved surfaces.",
    ];
  }
  return FDM_PRINT_RULES;
}

function formatConversationHistory(history?: CadChatMessage[]): string {
  if (!history?.length) return "";
  const lines = history.slice(-10).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`);
  return `Conversation history:\n${lines.join("\n")}`;
}

export function buildCadLlmPrompt(input: {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
  planContext?: CadPlanContext;
  quality?: CadQuality;
  conversationHistory?: CadChatMessage[];
  previousScad?: string;
}): { system: string; user: string } {
  const constraints = input.constraints ?? {};
  const projectType = input.projectType ?? "custom";
  const constraintLines = [
    constraints.dimensions && `Dimensions: ${constraints.dimensions}`,
    constraints.weight && `Weight target: ${constraints.weight}`,
    constraints.budget && `Budget: ${constraints.budget}`,
    constraints.voltage && `Voltage: ${constraints.voltage}`,
    constraints.skillLevel && `Skill level: ${constraints.skillLevel}`,
  ].filter(Boolean);

  const planLines = input.planContext
    ? [
        input.planContext.requirements &&
          `Engineering requirements:\n${input.planContext.requirements.slice(0, 1200)}`,
        input.planContext.assembly &&
          `Assembly notes:\n${input.planContext.assembly.slice(0, 800)}`,
        input.planContext.components && `Lista componente:\n${input.planContext.components.slice(0, 600)}`,
      ].filter(Boolean)
    : [];

  const hints = keywordHints(input.prompt);
  const projectGuide = PROJECT_CAD_GUIDANCE[projectType] ?? PROJECT_CAD_GUIDANCE.custom;
  const isRefine = Boolean(input.previousScad?.trim());
  const historyBlock = formatConversationHistory(input.conversationHistory);

  const system = [
    "You are an expert OpenSCAD mechanical CAD engineer for CAVALLO Studio.",
    "Return ONLY valid OpenSCAD source code — no markdown fences, no explanations.",
    "Units: millimeters. Use $fn = 64 or higher for curved parts.",
    "Start with parametric variables (dimensions, counts, thicknesses).",
    "Use modules for logical sub-parts. End with a top-level render call.",
    "Primitives: cube, cylinder, sphere, hull(), difference(), union(), linear_extrude, rotate_extrude.",
    "CRITICAL: NEVER name a module after an OpenSCAD built-in (hull, difference, union, intersection, minkowski, cube, cylinder, translate, rotate, etc.). Use names like body_hull, cabin, wheel_hub.",
    "CRITICAL: Call built-in hull as hull() { children... } — do not define module hull().",
    "CRITICAL: Model EXACTLY what the user asked for. Never substitute a generic cylindrical cap unless explicitly requested.",
    "CRITICAL: NEVER output furniture — no cabinet, wardrobe, dulap, drawer unit, sertare, chest of drawers, shelf unit, nightstand, or hollow furniture box — unless the user explicitly asked for furniture.",
    "CRITICAL: Never substitute furniture when the user asked for a hammer, prop, vehicle, toy, robot, or any other object.",
    "CRITICAL for cars/vehicles: body MUST be a SOLID closed silhouette (hull of cubes). NEVER use difference() to hollow the body into an open bathtub/tub/basin. Wheels are separate cylinders under the body.",
    "Include mounting holes, fillets (via offset/minkowski sparingly), and wall thickness when relevant.",
    "Ensure the model is a single watertight solid suitable for 3D printing.",
    ...fdmRulesForQuality(input.quality),
    isRefine
      ? "REFINE MODE: Modify the existing OpenSCAD below — preserve design intent and parametric structure. Do NOT restart from a unrelated primitive."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Project type: ${projectType}`,
    `=== PART REQUEST (highest priority) ===`,
    input.prompt,
    historyBlock,
    isRefine
      ? `Existing OpenSCAD to modify:\n${input.previousScad!.slice(0, 8000)}`
      : "",
    `Project CAD guidance: ${projectGuide}`,
    hints.length ? `Part-specific hints:\n${hints.join("\n")}` : "",
    constraintLines.length ? `Constraints:\n${constraintLines.join("\n")}` : "",
    planLines.length ? planLines.join("\n\n") : "",
    isRefine
      ? "Apply the latest user request as modifications to the existing OpenSCAD. Return the full updated script."
      : "Generate complete, parametric OpenSCAD for this ONE printable part only.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}

export function buildScadRepairPrompt(input: {
  originalPrompt: string;
  brokenScad: string;
  renderError: string;
}): { system: string; user: string } {
  const system = [
    "You fix broken OpenSCAD scripts for CAVALLO Studio.",
    "Return ONLY corrected OpenSCAD source — no markdown, no commentary.",
    "Fix syntax errors, undefined variables, non-manifold geometry, and zero-thickness walls.",
    "If the error is Recursion detected on hull/difference/union: you MUST rename that module (e.g. body_hull) — never shadow OpenSCAD built-ins.",
    "Keep the design intent from the original request.",
  ].join("\n");

  const user = [
    `Original request: ${input.originalPrompt.slice(0, 1500)}`,
    `OpenSCAD render error:\n${input.renderError.slice(0, 800)}`,
    `Broken source:\n${input.brokenScad.slice(0, 6000)}`,
    "Return fixed OpenSCAD that compiles cleanly.",
  ].join("\n\n");

  return { system, user };
}

export function stripScadFences(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/```(?:openscad|scad)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  return text.replace(/^```(?:openscad|scad)?/i, "").replace(/```$/, "").trim();
}

/** Built-ins that must never be used as custom module names (causes recursion). */
export const OPENSCAD_RESERVED_MODULE_NAMES = [
  "hull",
  "difference",
  "union",
  "intersection",
  "minkowski",
  "cube",
  "cylinder",
  "sphere",
  "polyhedron",
  "polygon",
  "circle",
  "square",
  "text",
  "linear_extrude",
  "rotate_extrude",
  "translate",
  "rotate",
  "scale",
  "mirror",
  "multmatrix",
  "color",
  "offset",
  "resize",
  "render",
  "surface",
  "import",
  "children",
  "echo",
  "assert",
] as const;

export function findShadowedBuiltinModules(scad: string): string[] {
  const found: string[] = [];
  for (const name of OPENSCAD_RESERVED_MODULE_NAMES) {
    if (new RegExp(`\\bmodule\\s+${name}\\b`, "i").test(scad)) {
      found.push(name);
    }
  }
  return found;
}

/**
 * Rename modules that shadow OpenSCAD built-ins (e.g. module hull → module cavallo_hull)
 * and rewrite semicolon-terminated call sites. Leaves builtin forms like hull() { ... }.
 */
export function sanitizeScadBuiltinShadows(scad: string): string {
  const shadowed = findShadowedBuiltinModules(scad);
  if (!shadowed.length) return scad;

  let out = scad;
  for (const name of shadowed) {
    const safe = `cavallo_${name}`;
    out = out.replace(new RegExp(`\\bmodule\\s+${name}\\b`, "gi"), `module ${safe}`);
    // Custom-module style calls end with `;`. Builtin CSG uses `name() { ... }`.
    out = out.replace(
      new RegExp(`\\b${name}\\s*\\(([^;]*?)\\)\\s*;`, "gi"),
      `${safe}($1);`
    );
  }
  return out;
}

export function validateScadSource(source: string): { ok: boolean; reason?: string } {
  const trimmed = sanitizeScadBuiltinShadows(source.trim());
  if (!trimmed) return { ok: false, reason: "Empty OpenSCAD source" };
  if (trimmed.length < 40) return { ok: false, reason: "OpenSCAD source too short" };

  const stillShadowed = findShadowedBuiltinModules(trimmed);
  if (stillShadowed.length) {
    return {
      ok: false,
      reason: `Module name(s) shadow OpenSCAD built-ins (${stillShadowed.join(", ")}). Rename them (e.g. body_hull).`,
    };
  }

  const hasPrimitive =
    /\b(cube|cylinder|sphere|polyhedron|linear_extrude|rotate_extrude|hull|minkowski)\s*\(/i.test(
      trimmed
    ) || /\bmodule\s+\w+/i.test(trimmed);
  if (!hasPrimitive) {
    return { ok: false, reason: "OpenSCAD must include primitives or a module definition" };
  }
  const hasRender =
    /\b\w+\s*\([^)]*\)\s*;/.test(trimmed) ||
    /\b(union|difference|intersection|hull|linear_extrude|rotate_extrude)\s*\(/i.test(trimmed);
  if (!hasRender) {
    return { ok: false, reason: "OpenSCAD must include a top-level render (module call or CSG)" };
  }
  return { ok: true };
}

/** True when the request is a toy / sports car (use deterministic SCAD template). */
export function isToyVehiclePrompt(prompt: string): boolean {
  return /(mașin[aăi]|masina|masini|toy\s*car|diecast|vehicle|camion|truck|tractor|buldozer|buggy|kart|automobil|ferrari|porsche|lamborghini|sports?\s*car|coupe|sedan|hot\s*wheels|mașinu[tț][aă]|masinuta)/iu.test(
    prompt
  );
}

/**
 * Deterministic solid toy / sports-car OpenSCAD.
 * Avoids LLM hollow-box (bathtub-with-wheels) failure mode.
 */
export function buildToyVehicleScad(prompt: string): string {
  const sports =
    /(ferrari|porsche|lamborghini|sports?\s*car|coupe|hot\s*wheels)/iu.test(prompt);
  const label = prompt.slice(0, 80).replace(/"/g, "'");
  return `// Deterministic toy car — solid body (NOT a hollow bathtub)
// Request: ${label}
$fn = 64;

body_len = ${sports ? 150 : 140};
body_w  = ${sports ? 58 : 62};
body_h  = ${sports ? 22 : 26};
cabin_len = ${sports ? 48 : 55};
cabin_w   = ${sports ? 42 : 48};
cabin_h   = ${sports ? 20 : 24};
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
    translate([${sports ? 8 : 0}, 0, 16])
      cube([body_len * 0.72, body_w * 0.88, 10], center = true);
  }
  // Cabin / windshield block — solid, sits ON the body
  translate([${sports ? -6 : -4}, 0, body_h + cabin_h / 2 - 2])
    hull() {
      cube([cabin_len, cabin_w, cabin_h], center = true);
      translate([cabin_len * 0.18, 0, -cabin_h * 0.15])
        cube([cabin_len * 0.7, cabin_w * 0.92, cabin_h * 0.7], center = true);
    }
${
  sports
    ? `  // Rear spoiler
  translate([-body_len / 2 + 14, 0, body_h + 10])
    cube([6, body_w * 0.92, 3], center = true);
  // Hood bulge
  translate([body_len * 0.22, 0, body_h + 2])
    cube([body_len * 0.28, body_w * 0.7, 6], center = true);
`
    : ""
}}

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

/** Reject oversimplified solids when the user clearly asked for a complex vehicle/heli. */
export function validateScadMatchesIntent(
  prompt: string,
  scad: string
): { ok: boolean; reason?: string } {
  const p = prompt;
  const cubeCount = (scad.match(/\bcube\s*\(/gi) ?? []).length;
  const cylCount = (scad.match(/\bcylinder\s*\(/gi) ?? []).length;
  const hullCount = (scad.match(/\bhull\s*\(/gi) ?? []).length;
  const moduleCount = (scad.match(/\bmodule\s+\w+/gi) ?? []).length;
  const diffCount = (scad.match(/\bdifference\s*\(/gi) ?? []).length;
  const tooSimple = cubeCount <= 2 && cylCount < 2 && hullCount < 1 && moduleCount < 2;

  if (/(elicopter|helicopter|\bheli\b)/iu.test(p)) {
    const named =
      /(rotor|fuselage|tail|skid|blade|cabin|boom)/i.test(scad) || cylCount >= 3;
    if (tooSimple || !named) {
      return {
        ok: false,
        reason:
          "Helicopter model too simple — need fuselage + main rotor + tail/skids (cylinders/hulls/modules), not a single box.",
      };
    }
  }

  if (isToyVehiclePrompt(p)) {
    // Hollow open-top body (bathtub) = difference() scooping a large cube — reject.
    const looksLikeTub =
      diffCount >= 1 &&
      cylCount >= 2 &&
      !/(spoiler|cabin|hood|grille|fender|wheel_well|solid_body|toy_car)/i.test(scad) &&
      hullCount < 1;
    if (looksLikeTub) {
      return {
        ok: false,
        reason:
          "Vehicle looks like a hollow bathtub with wheels — need a SOLID closed car body + cabin, not difference()-scooped tub.",
      };
    }
    const hasWheelModule = /(module\s+car_wheel|module\s+wheel|toy_car\s*\()/i.test(scad);
    const enoughWheels = cylCount >= 4 || (hasWheelModule && /for\s*\(/.test(scad));
    if (!enoughWheels || (tooSimple && !hasWheelModule)) {
      return {
        ok: false,
        reason:
          "Vehicle model too simple — need solid body + 4 wheel cylinders, not a single prism.",
      };
    }
  }

  return { ok: true };
}
