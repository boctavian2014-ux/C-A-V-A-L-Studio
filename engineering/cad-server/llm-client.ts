import { buildCadLlmPrompt, stripScadFences, validateScadSource } from "./scad-prompt";
import { fallbackScadForPrompt } from "./scad-runner";
import type { CadConstraints } from "./types";

export async function generateOpenScad(input: {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
}): Promise<{ ok: boolean; scad?: string; error?: string; usedFallback?: boolean }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const { system, user } = buildCadLlmPrompt(input);

  if (!apiKey) {
    const scad = fallbackScadForPrompt(input.prompt);
    return { ok: true, scad, usedFallback: true };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.CAD_PUBLIC_URL ?? "https://caval.studio",
        "X-Title": "Caval Studio CAD",
      },
      body: JSON.stringify({
        model: process.env.CAD_LLM_MODEL ?? "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      const scad = fallbackScadForPrompt(input.prompt);
      return { ok: true, scad, usedFallback: true, error: `LLM HTTP ${response.status}: ${text.slice(0, 200)}` };
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const scad = stripScadFences(raw);
    const validation = validateScadSource(scad);
    if (!validation.ok) {
      const fallback = fallbackScadForPrompt(input.prompt);
      return { ok: true, scad: fallback, usedFallback: true, error: validation.reason };
    }
    return { ok: true, scad };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: true, scad: fallbackScadForPrompt(input.prompt), usedFallback: true, error: message };
  }
}
