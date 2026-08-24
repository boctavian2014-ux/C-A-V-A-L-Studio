import {
  IDE_CONTEXT_FILE_CHARS,
  IDE_CONTEXT_GIT_FILES_MAX,
  IDE_CONTEXT_OUTPUT_CHARS,
  IDE_CONTEXT_PROBLEMS_MAX,
  IDE_CONTEXT_SELECTION_CHARS,
  IDE_CONTEXT_TOTAL_CHARS,
  type IdeContextActiveFile,
  type IdeContextGit,
  type IdeContextPayload,
  type IdeContextProblem,
  type IdeProblemSeverity,
} from "./ai-context-contract";
import { isSensitiveFile, sanitizeIdeText } from "./ai-context-security";

const SEVERITIES = new Set<IdeProblemSeverity>(["error", "warning", "info", "hint"]);

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function isFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n);
}

function estimatePayloadChars(ctx: IdeContextPayload): number {
  let n = 0;
  if (ctx.activeFile?.path) n += ctx.activeFile.path.length + (ctx.activeFile.language?.length ?? 0);
  if (ctx.activeFile?.selection?.text) n += ctx.activeFile.selection.text.length;
  if (ctx.activeFile?.content) n += ctx.activeFile.content.length;
  for (const p of ctx.problems ?? []) {
    n += p.file.length + p.message.length + (p.code?.length ?? 0) + 24;
  }
  if (ctx.git?.branch) n += ctx.git.branch.length;
  for (const f of ctx.git?.changedFiles ?? []) n += f.length + 1;
  if (ctx.outputTail) n += ctx.outputTail.length;
  return n;
}

function preferActiveFileProblems(
  problems: IdeContextProblem[],
  activePath: string | undefined
): IdeContextProblem[] {
  if (!activePath) return problems;
  const normalized = activePath.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const matched: IdeContextProblem[] = [];
  const rest: IdeContextProblem[] = [];
  for (const p of problems) {
    const file = p.file.replace(/\\/g, "/");
    if (file === normalized || file.endsWith(`/${base}`) || file === base) {
      matched.push(p);
    } else {
      rest.push(p);
    }
  }
  return [...matched, ...rest];
}

function sanitizeActiveFile(
  raw: IdeContextActiveFile | undefined
): IdeContextActiveFile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  if (typeof raw.path !== "string" || !raw.path.trim()) return undefined;
  if (isSensitiveFile(raw.path)) return undefined;

  const language = typeof raw.language === "string" && raw.language.trim() ? raw.language.trim() : "plaintext";
  const out: IdeContextActiveFile = {
    path: raw.path.trim().slice(0, 512),
    language: language.slice(0, 64),
  };

  const sel = raw.selection;
  if (sel && typeof sel === "object" && typeof sel.text === "string" && sel.text.length > 0) {
    if (
      isFiniteInt(sel.startLine) &&
      isFiniteInt(sel.endLine) &&
      isFiniteInt(sel.startColumn) &&
      isFiniteInt(sel.endColumn)
    ) {
      out.selection = {
        startLine: Math.max(1, sel.startLine),
        startColumn: Math.max(1, sel.startColumn),
        endLine: Math.max(1, sel.endLine),
        endColumn: Math.max(1, sel.endColumn),
        text: clip(sanitizeIdeText(sel.text), IDE_CONTEXT_SELECTION_CHARS),
      };
    }
  }

  // File content only when there is no selection (priority: selection > file).
  if (!out.selection && typeof raw.content === "string" && raw.content.length > 0) {
    out.content = clip(sanitizeIdeText(raw.content), IDE_CONTEXT_FILE_CHARS);
  }

  return out;
}

function sanitizeProblems(raw: unknown): IdeContextProblem[] {
  if (!Array.isArray(raw)) return [];
  const out: IdeContextProblem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (typeof p.file !== "string" || !p.file.trim()) continue;
    if (isSensitiveFile(p.file)) continue;
    if (!isFiniteInt(p.line) || !isFiniteInt(p.column)) continue;
    if (typeof p.message !== "string" || !p.message.trim()) continue;
    const severity = (
      typeof p.severity === "string" && SEVERITIES.has(p.severity as IdeProblemSeverity)
        ? p.severity
        : "warning"
    ) as IdeProblemSeverity;
    out.push({
      file: p.file.trim().slice(0, 512),
      line: Math.max(1, p.line),
      column: Math.max(1, p.column),
      severity,
      source: typeof p.source === "string" ? p.source.slice(0, 64) : "unknown",
      message: clip(sanitizeIdeText(p.message), 400),
      ...(typeof p.code === "string" && p.code.trim()
        ? { code: p.code.trim().slice(0, 64) }
        : {}),
    });
    if (out.length >= IDE_CONTEXT_PROBLEMS_MAX * 4) break;
  }
  return out;
}

function sanitizeGit(raw: unknown): IdeContextGit | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const g = raw as Record<string, unknown>;
  const changedFiles = Array.isArray(g.changedFiles)
    ? g.changedFiles
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .filter((f) => !isSensitiveFile(f))
        .map((f) => f.trim().slice(0, 512))
        .slice(0, IDE_CONTEXT_GIT_FILES_MAX)
    : [];
  const branch =
    typeof g.branch === "string" && g.branch.trim() ? g.branch.trim().slice(0, 128) : undefined;
  if (!branch && changedFiles.length === 0) return undefined;
  return { ...(branch ? { branch } : {}), changedFiles };
}

/**
 * Renderer-side sanitize: drop secrets / invalid shapes; light caps.
 * Main must still call {@link validateAndBudgetIdeContext}.
 */
export function sanitizeIdeContextPayload(input: unknown): IdeContextPayload | undefined {
  if (input == null) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;

  // Never accept workspaceRoot / functions / signals from renderer.
  const payload: IdeContextPayload = {};
  const activeFile = sanitizeActiveFile(raw.activeFile as IdeContextActiveFile | undefined);
  if (activeFile) payload.activeFile = activeFile;

  const problems = sanitizeProblems(raw.problems);
  if (problems.length) payload.problems = problems;

  const git = sanitizeGit(raw.git);
  if (git) payload.git = git;

  if (typeof raw.outputTail === "string" && raw.outputTail.trim()) {
    payload.outputTail = clip(sanitizeIdeText(raw.outputTail), IDE_CONTEXT_OUTPUT_CHARS);
  }

  if (!payload.activeFile && !payload.problems?.length && !payload.git && !payload.outputTail) {
    return undefined;
  }
  return payload;
}

/**
 * Main boundary: re-validate types, re-sanitize, enforce total budget with
 * deterministic degradation (selection > file > problems > git > output).
 */
export function validateAndBudgetIdeContext(input: unknown): IdeContextPayload | undefined {
  const base = sanitizeIdeContextPayload(input);
  if (!base) return undefined;

  const result: IdeContextPayload = {};

  if (base.activeFile) {
    const file: IdeContextActiveFile = {
      path: base.activeFile.path,
      language: base.activeFile.language,
    };
    if (base.activeFile.selection?.text) {
      file.selection = {
        ...base.activeFile.selection,
        text: clip(base.activeFile.selection.text, IDE_CONTEXT_SELECTION_CHARS),
      };
    } else if (base.activeFile.content) {
      file.content = clip(base.activeFile.content, IDE_CONTEXT_FILE_CHARS);
    }
    result.activeFile = file;
  }

  const orderedProblems = preferActiveFileProblems(
    base.problems ?? [],
    result.activeFile?.path
  ).slice(0, IDE_CONTEXT_PROBLEMS_MAX);
  if (orderedProblems.length) result.problems = orderedProblems;

  if (base.git) {
    result.git = {
      ...(base.git.branch ? { branch: base.git.branch } : {}),
      changedFiles: (base.git.changedFiles ?? []).slice(0, IDE_CONTEXT_GIT_FILES_MAX),
    };
  }

  if (base.outputTail) {
    result.outputTail = clip(base.outputTail, IDE_CONTEXT_OUTPUT_CHARS);
  }

  // Deterministic degradation until under total budget.
  // Priority keep: selection > file content > problems > git > output.
  if (estimatePayloadChars(result) > IDE_CONTEXT_TOTAL_CHARS && result.outputTail) {
    delete result.outputTail;
  }
  if (estimatePayloadChars(result) > IDE_CONTEXT_TOTAL_CHARS && result.git) {
    result.git = result.git.branch ? { branch: result.git.branch, changedFiles: [] } : undefined;
    if (!result.git) delete result.git;
  }
  if (estimatePayloadChars(result) > IDE_CONTEXT_TOTAL_CHARS && result.git?.branch) {
    delete result.git;
  }
  if (estimatePayloadChars(result) > IDE_CONTEXT_TOTAL_CHARS && result.problems?.length) {
    let count = result.problems.length;
    while (count > 0 && estimatePayloadChars({ ...result, problems: result.problems.slice(0, count) }) > IDE_CONTEXT_TOTAL_CHARS) {
      count = Math.max(0, Math.floor(count / 2));
    }
    if (count <= 0) delete result.problems;
    else result.problems = result.problems.slice(0, count);
  }
  if (estimatePayloadChars(result) > IDE_CONTEXT_TOTAL_CHARS && result.activeFile?.content) {
    const original = result.activeFile.content;
    let max = Math.min(original.length, IDE_CONTEXT_FILE_CHARS);
    while (max > 0) {
      result.activeFile = {
        ...result.activeFile,
        content: clip(original, max),
      };
      if (estimatePayloadChars(result) <= IDE_CONTEXT_TOTAL_CHARS) break;
      max = Math.floor(max / 2);
    }
    if (estimatePayloadChars(result) > IDE_CONTEXT_TOTAL_CHARS) {
      delete result.activeFile.content;
    }
  }
  if (estimatePayloadChars(result) > IDE_CONTEXT_TOTAL_CHARS && result.activeFile?.selection?.text) {
    const original = result.activeFile.selection.text;
    let max = Math.min(original.length, IDE_CONTEXT_SELECTION_CHARS);
    while (max > 0) {
      result.activeFile = {
        ...result.activeFile,
        selection: {
          ...result.activeFile.selection!,
          text: clip(original, max),
        },
      };
      if (estimatePayloadChars(result) <= IDE_CONTEXT_TOTAL_CHARS) break;
      max = Math.floor(max / 2);
    }
    if (estimatePayloadChars(result) > IDE_CONTEXT_TOTAL_CHARS) {
      delete result.activeFile.selection;
    }
  }
  if (
    estimatePayloadChars(result) > IDE_CONTEXT_TOTAL_CHARS &&
    result.activeFile &&
    !result.activeFile.selection &&
    !result.activeFile.content
  ) {
    delete result.activeFile;
  }

  if (!result.activeFile && !result.problems?.length && !result.git && !result.outputTail) {
    return undefined;
  }
  return result;
}

/** True when two paths name the same workspace file (absolute vs relative). */
export function workspaceFilePathOverlaps(a: string, b: string): boolean {
  const na = a.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  const nb = b.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  if (!na || !nb) return false;
  return na === nb || na.endsWith(`/${nb}`) || nb.endsWith(`/${na}`);
}

/** True when the user turn already contains this file body (avoid a second paste). */
export function userTurnAlreadyIncludesFileContent(
  userText: string,
  fileContent: string | undefined
): boolean {
  const body = fileContent?.trim();
  if (!body) return false;
  const compact = (s: string) => s.replace(/\s+/g, " ").trim();
  const userCompact = compact(userText);
  const bodyCompact = compact(body);
  if (userText.includes(body) || userCompact.includes(bodyCompact)) return true;
  const snippet = bodyCompact.slice(0, Math.min(160, bodyCompact.length));
  return snippet.length >= 24 && userCompact.includes(snippet);
}

export interface FormatIdeContextOptions {
  /** Skip repeating active-file body when the user turn already has it. */
  omitActiveFileContent?: boolean;
}

/** Prompt block: labeled untrusted so models treat it as data, not instructions. */
export function formatIdeContextForPrompt(
  ctx: IdeContextPayload,
  opts?: FormatIdeContextOptions
): string {
  const lines: string[] = [
    '<<IDE_CONTEXT kind="untrusted workspace content">>',
    "IDE snapshot (workspace data):",
  ];

  if (ctx.activeFile) {
    lines.push(`Active file: ${ctx.activeFile.path} (${ctx.activeFile.language})`);
    if (ctx.activeFile.selection) {
      const s = ctx.activeFile.selection;
      lines.push(
        `Selection L${s.startLine}:${s.startColumn}-L${s.endLine}:${s.endColumn}:`,
        "```",
        s.text,
        "```"
      );
    } else if (ctx.activeFile.content && !opts?.omitActiveFileContent) {
      lines.push("File content (truncated):", "```", ctx.activeFile.content, "```");
    }
  }

  if (ctx.problems?.length) {
    lines.push("Problems:");
    for (const p of ctx.problems) {
      const code = p.code ? ` ${p.code}` : "";
      lines.push(
        `- ${p.file}:${p.line}:${p.column} [${p.severity}/${p.source}]${code} ${p.message}`
      );
    }
  }

  if (ctx.git) {
    lines.push(`Git: branch=${ctx.git.branch ?? "(unknown)"}`);
    if (ctx.git.changedFiles.length) {
      lines.push(`Changed files: ${ctx.git.changedFiles.join(", ")}`);
    }
  }

  if (ctx.outputTail) {
    lines.push("Recent output (tail):", "```", ctx.outputTail, "```");
  }

  lines.push("<</IDE_CONTEXT>>");
  return lines.join("\n");
}

export function appendIdeContextBlock(message: string, block: string): string {
  if (!block.trim()) return message;
  if (!message.trim()) return block;
  return `${message}\n\n${block}`;
}

/** Ask/READ_ONLY chat — skip ZL, enhanced search, and project-tree dumps. */
export function isAskChatMode(mode?: string): boolean {
  return mode === "ask";
}

export function shouldAttachHeavyChatContext(mode?: string): boolean {
  return !isAskChatMode(mode);
}

/** @internal tests */
export function estimateIdeContextCharsForTests(ctx: IdeContextPayload): number {
  return estimatePayloadChars(ctx);
}
