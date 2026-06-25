import type { ComposerPatchFile, ComposerPatchSet } from "../composer/types";
import type { CodeReviewSession, ReviewFile, ReviewHunk, ReviewLine } from "./types";

function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export function parsePatchToReviewFile(file: ComposerPatchFile): ReviewFile {
  const hunks = parseUnifiedDiff(file.patch);
  const additions = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((l) => l.type === "add").length, 0);
  const deletions = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((l) => l.type === "remove").length, 0);

  return {
    id: randomUUID(),
    path: file.path,
    patch: file.patch,
    semanticSummary: file.semanticSummary,
    hunks,
    decision: "pending",
    stats: { additions, deletions }
  };
}

export function parseUnifiedDiff(patch: string): ReviewHunk[] {
  if (!patch.trim()) {
    return [createSyntheticHunk("No diff content — full file replacement", [])];
  }

  const hunks: ReviewHunk[] = [];
  const lines = patch.split(/\r?\n/);
  let current: ReviewHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
    if (hunkMatch) {
      if (current) hunks.push(current);
      oldLine = Number(hunkMatch[1]);
      newLine = Number(hunkMatch[3]);
      current = {
        id: randomUUID(),
        header: line,
        oldStart: oldLine,
        oldLines: Number(hunkMatch[2] ?? 1),
        newStart: newLine,
        newLines: Number(hunkMatch[4] ?? 1),
        lines: [],
        decision: "pending"
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("+")) {
      current.lines.push({
        id: randomUUID(),
        type: "add",
        newLineNumber: newLine++,
        content: line.slice(1),
        decision: "pending",
        semanticTag: inferSemanticTag(line.slice(1), "add")
      });
    } else if (line.startsWith("-")) {
      current.lines.push({
        id: randomUUID(),
        type: "remove",
        oldLineNumber: oldLine++,
        content: line.slice(1),
        decision: "pending",
        semanticTag: inferSemanticTag(line.slice(1), "remove")
      });
    } else if (line.startsWith(" ") || line === "") {
      current.lines.push({
        id: randomUUID(),
        type: "context",
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
        content: line.startsWith(" ") ? line.slice(1) : line,
        decision: "pending"
      });
    }
  }

  if (current) hunks.push(current);
  return hunks.length > 0 ? hunks : [createSyntheticHunk("Generated patch", [])];
}

function createSyntheticHunk(header: string, lines: ReviewLine[]): ReviewHunk {
  return {
    id: randomUUID(),
    header,
    oldStart: 1,
    oldLines: 0,
    newStart: 1,
    newLines: lines.length,
    lines,
    decision: "pending"
  };
}

function inferSemanticTag(content: string, type: "add" | "remove"): ReviewLine["semanticTag"] | undefined {
  if (/^(export\s+)?(class|function|interface|type|const)\s+/.test(content.trim())) {
    return type === "add" ? "new_symbol" : "delete_symbol";
  }
  if (/rename|=>/.test(content)) return "rename";
  if (/refactor|extract|move/.test(content)) return "refactor";
  if (type === "add" || type === "remove") return "logic_change";
  return undefined;
}

export function patchesToSession(workspaceRoot: string, patchSet: ComposerPatchSet): CodeReviewSession {
  return {
    id: randomUUID(),
    workspaceRoot,
    summary: patchSet.summary,
    files: patchSet.files.map(parsePatchToReviewFile),
    comments: [],
    status: "pending",
    createdAt: new Date().toISOString()
  };
}

export function sessionToAcceptedPatchSet(session: CodeReviewSession): ComposerPatchSet {
  const files: ComposerPatchFile[] = [];

  for (const file of session.files) {
    if (file.decision === "rejected") continue;

    const acceptedHunks = file.hunks.filter((hunk) => hunk.decision !== "rejected");
    if (acceptedHunks.length === 0) continue;

    const patch = acceptedHunks.map((hunk) => rebuildHunkPatch(hunk)).join("\n");
    if (patch.trim() || file.decision === "accepted") {
      files.push({
        path: file.path,
        patch: patch || file.patch,
        semanticSummary: file.semanticSummary
      });
    }
  }

  return { summary: session.summary, files };
}

function rebuildHunkPatch(hunk: ReviewHunk): string {
  const body = hunk.lines
    .filter((line) => line.decision !== "rejected")
    .map((line) => {
      if (line.type === "add") return `+${line.content}`;
      if (line.type === "remove") return `-${line.content}`;
      return ` ${line.content}`;
    })
    .join("\n");

  return `${hunk.header}\n${body}`;
}
