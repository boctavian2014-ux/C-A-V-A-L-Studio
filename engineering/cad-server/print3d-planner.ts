import type { CadChatMessage } from "./types";
import {
  adjustPlanPipeline,
  FREEFORM_MESH_RE,
  isClearlyMechanicalPrompt,
  suggestMeshFromPrompt,
} from "./cad-capabilities";

export type Print3DPlannerAction = "clarify" | "generate";
export type Print3DUserLanguage = "ro" | "en";
export type Print3DIntent = "mechanical" | "organic" | "figurine" | "mixed";
export type Print3DPipeline = "openscad" | "mesh";

export interface Print3DPlannerResult {
  action: Print3DPlannerAction;
  userLanguage: Print3DUserLanguage;
  intent: Print3DIntent;
  pipeline: Print3DPipeline;
  questions?: string[];
  assistantMessage?: string;
  technicalPrompt: string;
  suggestedDimensions?: string;
  warnings?: string[];
  quickReplies?: string[];
}

export interface PlanPrint3DInput {
  messages: CadChatMessage[];
  latestUserText: string;
  openRouterApiKey?: string;
  meshApiKey?: string;
  piapiApiKey?: string;
  previousMeshTaskId?: string;
}

const PLANNER_MODEL = process.env.CAD_PLANNER_MODEL ?? "openai/gpt-4o-mini";
const MAX_PLANNER_RETRIES = 2;

const PLANNER_SYSTEM = `You are a bilingual (Romanian + English) 3D printing consultant for FDM printers.
The user describes what they want in plain language. You translate intent into a technical spec.

Return ONLY valid JSON (no markdown fences) matching this schema:
{
  "action": "clarify" | "generate",
  "userLanguage": "ro" | "en",
  "intent": "mechanical" | "organic" | "figurine" | "mixed",
  "pipeline": "openscad" | "mesh",
  "questions": string[] (max 3, in userLanguage, only when action=clarify),
  "assistantMessage": string (friendly message in userLanguage),
  "technicalPrompt": string (always English, detailed mm dimensions, features, FDM constraints),
  "suggestedDimensions": string (optional),
  "warnings": string[] (optional, in userLanguage — IP/trademark, overhangs, etc.),
  "quickReplies": string[] (max 4 short tap-to-date in userLanguage when action=clarify)
}

Rules:
- userLanguage = language of the user's LATEST message (ro or en). assistantMessage and questions MUST use that language.
- action=clarify ONLY when critical info is missing: size/dimensions, object type (bust vs full figure vs part type), detail level, or ambiguous intent. Do NOT clarify if conversation history already answers these.
- action=generate when enough context exists (including from prior messages).
- CRITICAL OBJECT FIDELITY: technicalPrompt MUST describe the SAME object the user asked for. NEVER substitute furniture, drawers, sertare, cabinets, wardrobes, shelf units, bathtubs, tubs, basins, or sinks when the user asked for something else (hammer, prop, toy car, animal, etc.). Prefer the LATEST user message over older unrelated objects in history.
- If the user asks for ciocan / hammer / Mjolnir: pipeline=mesh, intent=figurine, technicalPrompt = visual hammer prop description (head + handle). NEVER furniture.
- DEFAULT PIPELINE CHOICE:
  - pipeline=mesh for ANY free-form / visual object the user describes in plain language: animals, insects, plants, characters, figurines, sculptures, faces, fantasy creatures, toy robots (looks), organic furniture, food, everyday objects without precise mechanical drawings.
  - pipeline=openscad ONLY for parametric/mechanical parts: brackets, gears, wheels with bore sizes, PCB/IoT enclosures with cutouts, mounts, frames, toy cars/helicopters built from primitives, CNC fixtures.
- Animals / insects / creatures (câine, pisică, fluture, păianjen, dragon, etc.): pipeline=mesh, intent=organic or figurine. technicalPrompt = rich English visual description for text-to-3D (pose, proportions, style, approx size mm), NOT OpenSCAD instructions.
- Toy cars / sports cars / Ferrari / helicopters (mașină jucărie, ferrari, elicopter): pipeline=openscad, intent=mechanical, with car body+4 wheels or fuselage/rotors/skids. NEVER a bathtub with wheels.
- Mechanical robots (arm, chassis, actuators, joints): pipeline=openscad. Cute/toy/figurine robots: pipeline=mesh.
- For IoT/sensor enclosures: pipeline=openscad with OLED window, vents, standoffs — never a blank box.
- For trademarked characters: warn in warnings, use generic description in technicalPrompt, never reproduce exact IP.
- technicalPrompt must always be English. For mesh: detailed visual description + approximate bounding size in mm + "suitable for FDM 3D printing, single solid". For openscad: explicit mm dimensions and features.
- quickReplies: 2-4 short clickable answers when clarifying.
- If user refines a previous mesh request, keep pipeline=mesh and incorporate changes in technicalPrompt.`;

function resolveApiKey(override?: string): string | undefined {
  const key = override?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  return key || undefined;
}

export function formatPlannerConversation(messages: CadChatMessage[], latestUserText: string): string {
  const lines = messages
    .filter((m) => m.content.trim())
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`);
  return [
    "Conversation:",
    ...lines,
    `User (latest): ${latestUserText.trim()}`,
  ].join("\n");
}

export function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function parsePlannerResponse(raw: string): Print3DPlannerResult | null {
  try {
    const json = JSON.parse(extractJsonObject(raw)) as Partial<Print3DPlannerResult>;
    if (json.action !== "clarify" && json.action !== "generate") return null;
    if (json.userLanguage !== "ro" && json.userLanguage !== "en") return null;
    if (!json.technicalPrompt?.trim()) return null;

    const intent = json.intent ?? "mixed";
    const validIntents: Print3DIntent[] = ["mechanical", "organic", "figurine", "mixed"];
    if (!validIntents.includes(intent)) return null;

    const pipeline = json.pipeline === "mesh" ? "mesh" : "openscad";

    return {
      action: json.action,
      userLanguage: json.userLanguage,
      intent: validIntents.includes(intent) ? intent : "mixed",
      pipeline,
      questions: json.questions?.slice(0, 3).filter(Boolean),
      assistantMessage: json.assistantMessage?.trim(),
      technicalPrompt: json.technicalPrompt.trim(),
      suggestedDimensions: json.suggestedDimensions?.trim(),
      warnings: json.warnings?.filter(Boolean),
      quickReplies: json.quickReplies?.slice(0, 4).filter(Boolean),
    };
  } catch {
    return null;
  }
}

export function buildClarifyMessage(plan: Print3DPlannerResult): string {
  const parts: string[] = [];
  if (plan.assistantMessage) parts.push(plan.assistantMessage);
  if (plan.questions?.length) {
    parts.push(plan.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
  }
  if (plan.warnings?.length) {
    parts.push(plan.warnings.join("\n"));
  }
  return parts.join("\n\n") || (plan.userLanguage === "ro" ? "Am nevoie de câteva detalii." : "I need a few details.");
}

const VEHICLE_USER_RE =
  /(mașin[aăi]|masina|masini|toy\s*car|diecast|vehicle|camion|truck|tractor|buldozer|buggy|kart|automobil|ferrari|porsche|lamborghini|sports?\s*car|coupe|sedan|hot\s*wheels|mașinu[tț][aă]|masinuta)/iu;
const HELICOPTER_USER_RE = /(elicopter|helicopter|\bheli\b|elicopter(?:e|ul)?)/iu;
const HAMMER_USER_RE =
  /(ciocan|hammer|mjolnir|mjölnir|thor[\s'-]?hammer|ciocanul|prop\s*hammer)/iu;
const USER_WANTS_FURNITURE_RE =
  /(dulap|cabinet|wardrobe|mobilier|furniture|sertar|sertare|drawer|comod[aă]|bibliotec[aă]|bookshelf|rafturi|noptier)/iu;
const FURNITURE_TECH_RE =
  /(dulap|cabinet|wardrobe|closet|drawer|drawers|sertar|chest of drawers|comod[aă]|mobilier|bookshelf|shelving|shelf unit|nightstand|dresser|cupboard)/iu;
/** Bathtub / plumbing / unrelated household shapes often hallucinated instead of cars. */
const WRONG_HOUSEHOLD_TECH_RE =
  /(bathtub|bath\s*tub|\btub\b|basin|sink|toilet|cad[aă]\b|cada\b|vas\s+de\s+baie|chiuvet|bathtub\s+with\s+wheels)/iu;
const GENERIC_BOX_TECH_RE =
  /(plain\s+box|rectangular\s+prism|simple\s+wedge|hollow\s+box|featureless|generic\s+block)/iu;
const HELICOPTER_FEATURE_RE = /(rotor|fuselage|tail\s*boom|skid|blade|cabin|elicopter|helicopter)/iu;
const VEHICLE_FEATURE_RE =
  /(chassis|caroserie|wheel|wheels|axle|hood|cabin|coupe|sedan|spoiler|grille|vehicle|toy\s*car|ferrari|sports?\s*car)/iu;

function helicopterTechnicalPrompt(user: string): string {
  return [
    "FDM-printable TOY HELICOPTER (NOT a box, NOT furniture, NOT a wedge).",
    `User request: ${user.slice(0, 400)}`,
    "Required parts as ONE unioned solid:",
    "- fuselage/cabin body ~80-120 mm long with rounded nose;",
    "- main rotor: hub cylinder + 2–4 thin blade plates Ø60-90 mm;",
    "- tail boom + small vertical fin + tail rotor disk;",
    "- two landing skids under the fuselage.",
    "Parametric OpenSCAD with modules (fuselage, main_rotor, tail, skids). Use cube+cylinder+hull. $fn>=64.",
  ].join(" ");
}

function vehicleTechnicalPrompt(user: string): string {
  const sports =
    /(ferrari|porsche|lamborghini|sports?\s*car|coupe|hot\s*wheels)/iu.test(user);
  return [
    "FDM-printable TOY CAR — look like a small diecast car (NOT a bathtub, NOT a tub, NOT a basin, NOT furniture, NOT a cabinet).",
    `User request: ${user.slice(0, 400)}`,
    sports
      ? "Sports-car silhouette: low sleek coupe body, short cabin, long hood, optional rear spoiler, rounded fenders."
      : "Classic toy-car silhouette: chassis/body, cabin or hood, clear car proportions.",
    "Required: body ~120-160 mm long, 4 wheels Ø25-35 mm with axles through wheel wells (wheels under the body, not a tub on rollers).",
    "Parametric OpenSCAD: hull/cube body + cylinder wheels. ONE printable solid assembly.",
    "Wall thickness >= 1.6 mm. Flat underside for bed adhesion. NEVER model a bathtub, sink, or furniture.",
  ].join(" ");
}

function meshObjectTechnicalPrompt(user: string): string {
  return [
    "Text-to-3D mesh for FDM printing (single solid, manifold).",
    `Subject: ${user.slice(0, 500)}`,
    "Describe the exact object the user named — match species/pose/style.",
    "Approx bounding size 60–120 mm unless user specified.",
    "Clean silhouette, printable without thin hair-like features under 1 mm.",
    "Do NOT invent a cabinet, drawers, sertare, wardrobe, shelf unit, bathtub, tub, basin, or unrelated furniture.",
  ].join(" ");
}

function hammerMeshTechnicalPrompt(user: string): string {
  return [
    "Text-to-3D FDM prop: mythic war hammer inspired by Thor's hammer (generic, not exact IP).",
    `User request: ${user.slice(0, 500)}`,
    "Blocky rectangular metal head, short leather-wrapped handle, optional wrist strap loop.",
    "Single solid ~120–180 mm tall, flat base on handle bottom or head side, manifold, no furniture/drawers.",
    "Suitable for FDM 3D printing, watertight.",
  ].join(" ");
}

/** Safety net: keep vehicles/helicopters on OpenSCAD; free-form objects on mesh; kill furniture swaps. */
export function alignPlanWithLatestUserIntent(
  latestUserText: string,
  plan: Print3DPlannerResult
): Print3DPlannerResult {
  const user = latestUserText.trim();
  const tech = plan.technicalPrompt;
  const assistant = plan.assistantMessage ?? "";

  if (HAMMER_USER_RE.test(user)) {
    return {
      ...plan,
      action: "generate",
      intent: "figurine",
      pipeline: "mesh",
      assistantMessage:
        plan.userLanguage === "ro"
          ? "Generez un ciocan/prop tip Mjolnir (text-to-3D), nu mobilier."
          : "Generating a Mjolnir-style hammer prop (text-to-3D), not furniture.",
      technicalPrompt:
        plan.pipeline === "mesh" &&
        tech.length > 40 &&
        !FURNITURE_TECH_RE.test(tech) &&
        /(hammer|mjolnir|head|handle|ciocan)/i.test(tech)
          ? tech
          : hammerMeshTechnicalPrompt(user),
      warnings: [
        ...(plan.warnings ?? []).filter((w) => !/dulap|cabinet|mobilier|furniture/i.test(w)),
        plan.userLanguage === "ro"
          ? "Am forțat modelul pe ciocan/prop (nu dulap/sertare)."
          : "Forced hammer prop plan (not cabinet/drawers).",
      ],
    };
  }

  if (HELICOPTER_USER_RE.test(user)) {
    const wrongObject =
      FURNITURE_TECH_RE.test(tech) ||
      FURNITURE_TECH_RE.test(assistant) ||
      GENERIC_BOX_TECH_RE.test(tech) ||
      !HELICOPTER_FEATURE_RE.test(tech);
    if (wrongObject || plan.pipeline === "mesh") {
      return {
        ...plan,
        action: "generate",
        intent: "mechanical",
        pipeline: "openscad",
        assistantMessage:
          plan.userLanguage === "ro"
            ? "Generez un elicopter jucărie (fuselaj + rotor + skids)."
            : "Generating a toy helicopter (fuselage + rotor + skids).",
        technicalPrompt: helicopterTechnicalPrompt(user),
        warnings: [
          ...(plan.warnings ?? []),
          plan.userLanguage === "ro"
            ? "Am forțat planul pentru elicopter (nu cutie/dulap)."
            : "Forced helicopter plan (not a plain box/cabinet).",
        ],
      };
    }
    return {
      ...plan,
      action: "generate",
      intent: "mechanical",
      pipeline: "openscad",
    };
  }

  // Vehicles always win over free-form mesh (even when "jucărie" also matches FREEFORM).
  if (VEHICLE_USER_RE.test(user)) {
    const wrongObject =
      FURNITURE_TECH_RE.test(tech) ||
      FURNITURE_TECH_RE.test(assistant) ||
      WRONG_HOUSEHOLD_TECH_RE.test(tech) ||
      WRONG_HOUSEHOLD_TECH_RE.test(assistant) ||
      GENERIC_BOX_TECH_RE.test(tech) ||
      !VEHICLE_FEATURE_RE.test(tech) ||
      plan.pipeline === "mesh" ||
      plan.intent === "organic";

    if (wrongObject) {
      return {
        ...plan,
        action: "generate",
        intent: "mechanical",
        pipeline: "openscad",
        assistantMessage:
          plan.userLanguage === "ro"
            ? "Generez o mașină jucărie (caroserie + 4 roți) — nu cadă, nu mobilier."
            : "Generating a toy car (body + 4 wheels) — not a bathtub, not furniture.",
        technicalPrompt: vehicleTechnicalPrompt(user),
        warnings: [
          ...(plan.warnings ?? []).filter(
            (w) => !/dulap|cabinet|mobilier|furniture|cad[aă]|bathtub/i.test(w)
          ),
          plan.userLanguage === "ro"
            ? "Am forțat planul pe mașină jucărie (caroserie+roți), nu cadă/dulap."
            : "Forced toy-car plan (body+wheels), not bathtub/cabinet.",
        ],
      };
    }

    return {
      ...plan,
      action: "generate",
      intent: "mechanical",
      pipeline: "openscad",
      technicalPrompt: tech.length > 40 ? tech : vehicleTechnicalPrompt(user),
    };
  }

  // Planner hallucinated furniture/drawers/bathtub while user asked for something else.
  if (
    (FURNITURE_TECH_RE.test(tech) ||
      FURNITURE_TECH_RE.test(assistant) ||
      WRONG_HOUSEHOLD_TECH_RE.test(tech) ||
      WRONG_HOUSEHOLD_TECH_RE.test(assistant)) &&
    !USER_WANTS_FURNITURE_RE.test(user) &&
    !/(cad[aă]|bathtub|tub|basin|sink)/iu.test(user)
  ) {
    return {
      ...plan,
      action: "generate",
      intent: "organic",
      pipeline: "mesh",
      assistantMessage:
        plan.userLanguage === "ro"
          ? `Generez obiectul cerut („${user.slice(0, 80)}”), nu mobilă/cadă/sertare.`
          : `Generating the requested object (“${user.slice(0, 80)}”), not furniture/bathtub/drawers.`,
      technicalPrompt: meshObjectTechnicalPrompt(user),
      warnings: [
        ...(plan.warnings ?? []),
        plan.userLanguage === "ro"
          ? "Am respins planul greșit (mobilier/cadă) — nu era în cererea ta."
          : "Rejected wrong-object plan (furniture/bathtub) — not what you asked for.",
      ],
    };
  }

  if (
    (FREEFORM_MESH_RE.test(user) || suggestMeshFromPrompt(user)) &&
    !isClearlyMechanicalPrompt(user)
  ) {
    const intent: Print3DPlannerResult["intent"] =
      /(figurin|character|personaj|bust|human|om\b)/iu.test(user) ? "figurine" : "organic";
    return {
      ...plan,
      action: "generate",
      intent,
      pipeline: "mesh",
      assistantMessage:
        plan.assistantMessage && !FURNITURE_TECH_RE.test(plan.assistantMessage)
          ? plan.assistantMessage
          : plan.userLanguage === "ro"
            ? "Generez modelul 3D liber din text (Trellis/Meshy)."
            : "Generating a free-form 3D model from text (Trellis/Meshy).",
      technicalPrompt:
        plan.pipeline === "mesh" &&
        tech.length > 40 &&
        !FURNITURE_TECH_RE.test(tech) &&
        !GENERIC_BOX_TECH_RE.test(tech)
          ? tech
          : meshObjectTechnicalPrompt(user),
    };
  }

  return plan;
}

async function callPlannerLlm(
  apiKey: string,
  userContent: string
): Promise<{ ok: boolean; content?: string; error?: string }> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.CAD_PUBLIC_URL ?? "https://caval.studio",
        "X-Title": "CAVALLO Studio Print3D Planner",
      },
      body: JSON.stringify({
        model: PLANNER_MODEL,
        messages: [
          { role: "system", content: PLANNER_SYSTEM },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Planner HTTP ${response.status}: ${text.slice(0, 300)}` };
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) return { ok: false, error: "Planner returned empty content" };
    return { ok: true, content };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function planPrint3DRequest(
  input: PlanPrint3DInput
): Promise<{ ok: boolean; plan?: Print3DPlannerResult; error?: string }> {
  const apiKey = resolveApiKey(input.openRouterApiKey);
  if (!apiKey) {
    return {
      ok: false,
      error: "OPENROUTER_API_KEY not configured. Add it in Settings → OpenRouter.",
    };
  }

  const userContent = [
    formatPlannerConversation(input.messages, input.latestUserText),
    input.previousMeshTaskId
      ? `\nPrevious mesh task ID for refinement context: ${input.previousMeshTaskId}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let lastError = "Invalid planner response";

  for (let attempt = 1; attempt <= MAX_PLANNER_RETRIES; attempt++) {
    const retryNote =
      attempt > 1 ? "\n\nPrevious response was invalid JSON. Return ONLY the JSON object." : "";
    const result = await callPlannerLlm(apiKey, userContent + retryNote);
    if (!result.ok) return { ok: false, error: result.error };

    const plan = parsePlannerResponse(result.content!);
    if (plan) {
      const aligned = alignPlanWithLatestUserIntent(input.latestUserText, plan);
      const adjusted = await adjustPlanPipeline(aligned, input.meshApiKey, input.piapiApiKey);
      return { ok: true, plan: adjusted };
    }
    lastError = "Planner returned unparseable JSON";
  }

  return { ok: false, error: lastError };
}
