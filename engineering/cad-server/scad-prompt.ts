import type { CadChatMessage, CadConstraints, CadPlanContext, CadQuality } from "./types";

const PROJECT_CAD_GUIDANCE: Record<string, string> = {
  drone:
    "Drone parts: motor mounts, prop guards, landing gear, battery trays, camera mounts, antenna holders. For propellers use rotate_extrude blade profile or twisted extrude — NOT a plain hollow cylinder unless user asked for a cap.",
  robot:
    "Robot parts: wheels (hub + tire profile via rotate_extrude), chassis plates, encoder mounts, LiDAR brackets, gear holders. Wheels need hub bore, tire outer diameter, and tread.",
  iot:
    "IoT parts: sensor enclosures with cable glands, PCB standoffs, battery holders, wall-mount brackets. Include snap-fit or screw bosses.",
  cnc:
    "CNC parts: spindle mounts, limit-switch brackets, cable chains, control panel bezels, extrusion adapters.",
  custom:
    "Match the user's described geometry precisely. Use parametric modules and meaningful variable names.",
};

const PART_KEYWORD_HINTS: Array<{ pattern: RegExp; hint: string }> = [
  {
    pattern: /\b(roata|roată|wheel|tire|anvelopă|anvelopa)\b/i,
    hint: "Design a WHEEL: hub cylinder + tire (rotate_extrude torus-like profile or rounded outer ring), optional spokes. Include bore diameter and width parameters.",
  },
  {
    pattern: /\b(elice|propeller|prop|helice)\b/i,
    hint: "Design a PROPELLER: 2–4 blades with rotate_extrude or linear_extrude twisted airfoil, central hub with motor bore.",
  },
  {
    pattern: /\b(angrenaj|gear|pinion)\b/i,
    hint: "Design a GEAR: use rotate_extrude tooth profile or simplified involute approximation with tooth count, module/pitch, bore.",
  },
  {
    pattern: /\b(bracket|suport|mount|prindere)\b/i,
    hint: "Design a BRACKET: L or U shape with mounting holes, ribbing, screw countersinks.",
  },
  {
    pattern: /\b(enclosure|carcase|capac|cutie|case)\b/i,
    hint: "Design an ENCLOSURE: box with wall thickness, lid lip, standoffs, ventilation slots if needed.",
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
    "You are an expert OpenSCAD mechanical CAD engineer for Caval Studio.",
    "Return ONLY valid OpenSCAD source code — no markdown fences, no explanations.",
    "Units: millimeters. Use $fn = 64 or higher for curved parts.",
    "Start with parametric variables (dimensions, counts, thicknesses).",
    "Use modules for logical sub-parts. End with a top-level render call.",
    "Primitives: cube, cylinder, sphere, hull, difference, union, linear_extrude, rotate_extrude.",
    "CRITICAL: Model EXACTLY what the user asked for. Never substitute a generic cylindrical cap unless explicitly requested.",
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
    "You fix broken OpenSCAD scripts for Caval Studio.",
    "Return ONLY corrected OpenSCAD source — no markdown, no commentary.",
    "Fix syntax errors, undefined variables, non-manifold geometry, and zero-thickness walls.",
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

export function validateScadSource(source: string): { ok: boolean; reason?: string } {
  const trimmed = source.trim();
  if (!trimmed) return { ok: false, reason: "Empty OpenSCAD source" };
  if (trimmed.length < 40) return { ok: false, reason: "OpenSCAD source too short" };
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
