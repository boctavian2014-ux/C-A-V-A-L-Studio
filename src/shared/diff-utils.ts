import type { ReviewLine } from "../../ai/review/types";

export type HunkApplyDirection = "forward" | "reverse";

/** Apply a unified diff (one or more hunks) to file content. */
export function applyUnifiedDiff(current: string, patch: string): string {
  if (!patch.includes("@@")) {
    return patch.trim().length > 0 ? patch : current;
  }

  const currentLines = current.split(/\r?\n/);
  const output: string[] = [];
  let cursor = 0;
  const lines = patch.split(/\r?\n/).filter((line) => !line.startsWith("---") && !line.startsWith("+++"));

  for (let index = 0; index < lines.length; index += 1) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(lines[index]);
    if (!hunk) continue;
    const oldStart = Number(hunk[1]) - 1;
    output.push(...currentLines.slice(cursor, oldStart));
    cursor = oldStart;
    index += 1;
    while (index < lines.length && !lines[index].startsWith("@@")) {
      const line = lines[index];
      if (line.startsWith(" ")) {
        output.push(line.slice(1));
        cursor += 1;
      } else if (line.startsWith("-")) {
        cursor += 1;
      } else if (line.startsWith("+")) {
        output.push(line.slice(1));
      }
      index += 1;
    }
    index -= 1;
  }

  output.push(...currentLines.slice(cursor));
  return output.join("\n");
}

export function buildHunkPatch(hunk: { header: string; lines: Pick<ReviewLine, "type" | "content">[] }): string {
  const body = hunk.lines
    .map((line: Pick<ReviewLine, "type" | "content">) => {
      if (line.type === "add") return `+${line.content}`;
      if (line.type === "remove") return `-${line.content}`;
      return ` ${line.content}`;
    })
    .join("\n");
  return `${hunk.header}\n${body}`;
}

/** Swap +/- lines and @@ ranges for applying on the post-change file. */
export function reverseHunkPatch(hunkPatch: string): string {
  const lines = hunkPatch.split(/\r?\n/);
  if (lines.length === 0) return hunkPatch;

  const header = lines[0];
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(header);
  if (!match) return hunkPatch;

  const revHeader = `@@ -${match[3]},${match[4] ?? "1"} +${match[1]},${match[2] ?? "1"} @@${match[5] ?? ""}`;
  const body = lines.slice(1).map((line) => {
    if (line.startsWith("+")) return `-${line.slice(1)}`;
    if (line.startsWith("-")) return `+${line.slice(1)}`;
    return line;
  });

  return [revHeader, ...body].join("\n");
}

export function applyHunkToContent(
  content: string,
  hunkPatch: string,
  direction: HunkApplyDirection = "forward"
): string {
  const patch = direction === "reverse" ? reverseHunkPatch(hunkPatch) : hunkPatch;
  return applyUnifiedDiff(content, patch);
}
