/**
 * M3 Tasks IPC contract — shared by main, preload, and renderer.
 *
 * Security: the renderer never sends a cwd or a free shell command.
 * Main binds cwd to the workspace and runs `npm run -- <taskName>` only
 * for scripts that exist in that workspace's package.json.
 */

export type TaskSource = "package.json" | "caval.jsonc";

export interface Task {
  name: string;
  command: string;
  source: TaskSource;
}

export type TaskRunStatus = "starting" | "running" | "success" | "failed" | "stopped";

export interface TaskRun {
  id: string;
  taskName: string;
  status: TaskRunStatus;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  /** Output channel id (not a PTY). Renderer uses this to show logs. */
  terminalId: string | null;
}

export interface TaskOutputChunk {
  runId: string;
  taskName: string;
  data: string;
}

export interface TasksApi {
  list(): Promise<Task[]>;
  run(taskName: string): Promise<TaskRun>;
  stop(runId: string): Promise<void>;
  getRun(runId: string): Promise<TaskRun>;
  getRuns(): Promise<TaskRun[]>;
  onRunChanged(cb: (run: TaskRun) => void): () => void;
  onOutput(cb: (chunk: TaskOutputChunk) => void): () => void;
}

const TASK_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/;

export function isValidTaskName(name: unknown): name is string {
  if (typeof name !== "string" || name.length === 0 || name.length > 128) return false;
  if (name.startsWith("-") || name.includes("..")) return false;
  return TASK_NAME_RE.test(name);
}

export function isValidRunId(id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0 || id.length > 128) return false;
  if (id.includes("..") || id.includes("/") || id.includes("\\") || id.includes("\0")) return false;
  return true;
}
