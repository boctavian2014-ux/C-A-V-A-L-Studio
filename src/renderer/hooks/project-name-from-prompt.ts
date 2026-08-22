import { isScaffoldContinueRequest } from "../../../ai/prompts/scaffold-emission-rule";
import { isDeliveryContinueRequest } from "../../../ai/prompts/full-delivery-rule";
import { isAgenticRepairRequest } from "../../../ai/prompts/agentic-repair";
import { isArenaContinueRequest } from "../../../ai/prompts/arena-continue";

/** Derive a short folder name from the user prompt (first line). */
export function projectNameFromPrompt(text: string): string {
  const raw = (text || "").trim();
  if (
    isScaffoldContinueRequest(raw) ||
    isDeliveryContinueRequest(raw) ||
    isAgenticRepairRequest(raw) ||
    isArenaContinueRequest(raw)
  ) {
    return "Caval-Project";
  }

  const first = raw.split(/\r?\n/)[0] ?? "";
  const cleaned = first
    .replace(
      /^(creează|creaza|create|build|make|generează|genereaza|scaffold|proiect|project)\s+/i,
      ""
    )
    .replace(/[^\p{L}\p{N}\s\-_]+/gu, " ")
    .trim()
    .slice(0, 48);
  return cleaned || "Caval-Project";
}
