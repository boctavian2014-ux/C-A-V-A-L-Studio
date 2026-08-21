/** Derive a short folder name from the user prompt (first line). */
export function projectNameFromPrompt(text: string): string {
  const first = (text || "").trim().split(/\r?\n/)[0] ?? "";
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
