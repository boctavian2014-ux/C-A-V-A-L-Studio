/**
 * M3 Problems IPC contract — shared by main, preload, and renderer.
 *
 * Security: the renderer never chooses a workspace cwd or a free shell command.
 * Main binds collect() to the workspace and runs local TypeScript/ESLint binaries only.
 */

export type ProblemSeverity = "error" | "warning" | "info" | "hint";

export type ProblemSource = "typescript" | "eslint" | "caval";

export interface Problem {
  id: string;
  /** Relative path from the bound workspace root. */
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: ProblemSeverity;
  source: ProblemSource;
  message: string;
  /** e.g. TS2322, no-unused-vars */
  code?: string;
}

export interface ProblemsSummary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
}

export interface ProblemsApi {
  getProblems(file?: string): Promise<Problem[]>;
  getSummary(): Promise<ProblemsSummary>;
  refresh(): Promise<void>;
  onProblemsChanged(cb: (problems: Problem[]) => void): () => void;
  onSummaryChanged(cb: (summary: ProblemsSummary) => void): () => void;
}

export function summarizeProblems(problems: readonly Problem[]): ProblemsSummary {
  const summary: ProblemsSummary = { total: problems.length, errors: 0, warnings: 0, infos: 0, hints: 0 };
  for (const problem of problems) {
    if (problem.severity === "error") summary.errors += 1;
    else if (problem.severity === "warning") summary.warnings += 1;
    else if (problem.severity === "info") summary.infos += 1;
    else summary.hints += 1;
  }
  return summary;
}
