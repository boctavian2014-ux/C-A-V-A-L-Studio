import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";

import { redactSensitiveCommandOutput } from "../../shared/command-output-redaction";
import {
  summarizeProblems,
  type Problem,
  type ProblemSeverity,
  type ProblemsSummary,
} from "../../shared/problems-contract";
import { sanitizeEnvForTerminal } from "../subprocess-env";

export interface ProblemsToolResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type ProblemsToolKind = "typescript" | "eslint";

export type ProblemsToolRunner = (
  kind: ProblemsToolKind,
  args: string[],
  cwd: string
) => Promise<ProblemsToolResult>;

export interface ProblemsServiceOptions {
  runTool?: ProblemsToolRunner;
}

const MAX_PROBLEMS = 2000;
const TOOL_TIMEOUT_MS = 60_000;
const TSC_ARGS = ["--noEmit", "--pretty", "false"] as const;
const ESLINT_ARGS = ["--format", "json", "."] as const;

const ESLINT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
] as const;

const TSC_LINE =
  /^(.+?)\((\d+),(\d+)\):\s+(error|warning|info|hint|suggestion)\s+TS(\d+):\s+(.+)$/i;

export function mapDiagnosticSeverity(value: string): ProblemSeverity {
  switch (value.toLowerCase()) {
    case "warning":
      return "warning";
    case "info":
      return "info";
    case "hint":
    case "suggestion":
      return "hint";
    default:
      return "error";
  }
}

export function toWorkspaceRelativeFile(cwd: string, file: string): string | null {
  const trimmed = file.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return null;
  const abs = path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(cwd, trimmed);
  const rel = path.relative(cwd, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.replace(/\\/g, "/");
}

export function hasTsconfig(cwd: string): boolean {
  return existsSync(path.join(cwd, "tsconfig.json"));
}

export function hasEslintConfig(cwd: string): boolean {
  return ESLINT_CONFIG_FILES.some((name) => existsSync(path.join(cwd, name)));
}

export function resolveWorkspaceDiagnosticScript(cwd: string, kind: ProblemsToolKind): string | null {
  const rel =
    kind === "typescript"
      ? path.join("node_modules", "typescript", "lib", "tsc.js")
      : path.join("node_modules", "eslint", "bin", "eslint.js");
  const abs = path.join(cwd, rel);
  if (!existsSync(abs)) return null;
  const inside = path.relative(cwd, abs);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) return null;
  return abs;
}

export function parseTypeScriptOutput(output: string, cwd: string): Problem[] {
  const problems: Problem[] = [];
  const seen = new Set<string>();

  for (const raw of output.split(/\r?\n/)) {
    const match = TSC_LINE.exec(raw.trimEnd());
    if (!match) continue;
    const [, file, lineStr, colStr, severity, code, message] = match;
    const rel = toWorkspaceRelativeFile(cwd, file ?? "");
    if (!rel) continue;
    const line = Number(lineStr);
    const column = Number(colStr);
    const id = `ts-${rel}-${line}-${column}-TS${code}`;
    if (seen.has(id)) continue;
    seen.add(id);
    problems.push({
      id,
      file: rel,
      line,
      column,
      severity: mapDiagnosticSeverity(severity ?? "error"),
      source: "typescript",
      message: (message ?? "").trim(),
      code: `TS${code}`,
    });
    if (problems.length >= MAX_PROBLEMS) break;
  }

  return problems;
}

export function parseEslintOutput(output: string, cwd: string): Problem[] {
  const problems: Problem[] = [];
  const start = output.indexOf("[");
  if (start < 0) return problems;

  try {
    const results = JSON.parse(output.slice(start)) as Array<{
      filePath?: string;
      messages?: Array<{
        line?: number;
        column?: number;
        endLine?: number;
        endColumn?: number;
        severity?: number;
        message?: string;
        ruleId?: string | null;
      }>;
    }>;

    const seen = new Set<string>();
    for (const result of results) {
      const rel = toWorkspaceRelativeFile(cwd, result.filePath ?? "");
      if (!rel) continue;
      for (const msg of result.messages ?? []) {
        const line = Number(msg.line) || 1;
        const column = Number(msg.column) || 1;
        const code = msg.ruleId ?? undefined;
        const id = `eslint-${rel}-${line}-${column}-${code ?? "parse"}`;
        if (seen.has(id)) continue;
        seen.add(id);
        problems.push({
          id,
          file: rel,
          line,
          column,
          endLine: msg.endLine,
          endColumn: msg.endColumn,
          severity: msg.severity === 2 ? "error" : msg.severity === 1 ? "warning" : "info",
          source: "eslint",
          message: String(msg.message ?? "").trim(),
          code,
        });
        if (problems.length >= MAX_PROBLEMS) return problems;
      }
    }
  } catch {
    return [];
  }

  return problems;
}

function runLocalDiagnosticTool(
  kind: ProblemsToolKind,
  args: string[],
  cwd: string
): Promise<ProblemsToolResult> {
  const script = resolveWorkspaceDiagnosticScript(cwd, kind);
  if (!script) {
    return Promise.resolve({ stdout: "", stderr: "", code: 0 });
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(process.execPath, [script, ...args], {
      cwd,
      shell: false,
      windowsHide: true,
      env: {
        ...sanitizeEnvForTerminal(),
        ELECTRON_RUN_AS_NODE: "1",
      },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (!proc.killed) proc.kill();
    }, TOOL_TIMEOUT_MS);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({
        stdout: redactSensitiveCommandOutput(stdout),
        stderr: redactSensitiveCommandOutput(stderr),
        code: code ?? -1,
      });
    });
  });
}

export class ProblemsService extends EventEmitter {
  private problems: Problem[] = [];
  private summary: ProblemsSummary = summarizeProblems([]);
  private collectGen = 0;
  private readonly run: ProblemsToolRunner;

  constructor(options: ProblemsServiceOptions = {}) {
    super();
    this.run = options.runTool ?? runLocalDiagnosticTool;
  }

  private emitChanged(): void {
    this.summary = summarizeProblems(this.problems);
    this.emit("problems-changed", this.problems);
    this.emit("summary-changed", this.summary);
  }

  async collect(cwd: string): Promise<void> {
    const gen = ++this.collectGen;
    const collected: Problem[] = [];

    if (hasTsconfig(cwd)) {
      try {
        const result = await this.run("typescript", [...TSC_ARGS], cwd);
        collected.push(...parseTypeScriptOutput(`${result.stdout}\n${result.stderr}`, cwd));
      } catch {
        // missing tsc or spawn error — skip TypeScript for this pass
      }
    }

    if (hasEslintConfig(cwd) && collected.length < MAX_PROBLEMS) {
      try {
        const result = await this.run("eslint", [...ESLINT_ARGS], cwd);
        collected.push(...parseEslintOutput(result.stdout || result.stderr, cwd));
      } catch {
        // missing eslint or spawn error — skip ESLint for this pass
      }
    }

    if (gen !== this.collectGen) return;
    this.problems = collected.slice(0, MAX_PROBLEMS);
    this.emitChanged();
  }

  getProblems(file?: string): Problem[] {
    if (file) {
      const normalized = file.replace(/\\/g, "/");
      return this.problems.filter((problem) => problem.file === normalized);
    }
    return this.problems;
  }

  getSummary(): ProblemsSummary {
    return this.summary;
  }
}

export const problemsService = new ProblemsService();
