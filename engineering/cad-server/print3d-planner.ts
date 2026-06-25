import type { CadChatMessage } from "./types";

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
- pipeline=openscad for mechanical/parametric parts (brackets, gears, wheels, enclosures, mounts).
- pipeline=mesh for organic shapes, characters, figurines, sculptures, animals, faces.
- For trademarked characters (Mickey Mouse, etc.): warn in warnings, use generic description in technicalPrompt (e.g. "cartoon mouse with round ears"), never reproduce exact IP.
- technicalPrompt must always be English with explicit mm dimensions when known or reasonable defaults stated.
- quickReplies: 2-4 short clickable answers when clarifying (e.g. "Bust 80mm", "Full figure 120mm").
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
        "X-Title": "Caval Studio Print3D Planner",
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
    if (plan) return { ok: true, plan };
    lastError = "Planner returned unparseable JSON";
  }

  return { ok: false, error: lastError };
}
