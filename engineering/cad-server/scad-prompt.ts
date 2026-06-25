import type { CadConstraints } from "./types";

export function buildCadLlmPrompt(input: {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
}): { system: string; user: string } {
  const constraints = input.constraints ?? {};
  const constraintLines = [
    constraints.dimensions && `Dimensions: ${constraints.dimensions}`,
    constraints.weight && `Weight target: ${constraints.weight}`,
    constraints.budget && `Budget: ${constraints.budget}`,
    constraints.voltage && `Voltage: ${constraints.voltage}`,
    constraints.skillLevel && `Skill level: ${constraints.skillLevel}`,
  ].filter(Boolean);

  const system = [
    "You are an expert OpenSCAD engineer for Caval Studio Engineering AI.",
    "Return ONLY valid OpenSCAD source code — no markdown fences, no explanations.",
    "Use millimeters. Include parameters at the top when useful.",
    "End with a top-level call that renders the part (e.g. part(); or union(){...}).",
    "Prefer simple primitives: cube, cylinder, sphere, hull, difference, union.",
    "Design printable mechanical parts: enclosures, caps, brackets, mounts.",
  ].join("\n");

  const user = [
    `Project type: ${input.projectType ?? "custom"}`,
    `Part request: ${input.prompt}`,
    constraintLines.length ? `Constraints:\n${constraintLines.join("\n")}` : "",
    "Generate complete OpenSCAD for this single part.",
  ]
    .filter(Boolean)
    .join("\n\n");

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
  const hasPrimitive =
    /\b(cube|cylinder|sphere|polyhedron|linear_extrude|rotate_extrude|hull|minkowski)\s*\(/i.test(
      trimmed
    ) || /\bmodule\s+\w+/i.test(trimmed);
  if (!hasPrimitive) {
    return { ok: false, reason: "OpenSCAD must include primitives or a module definition" };
  }
  return { ok: true };
}
