/**
 * M3 Terminal IPC contract — shared by main, preload, and renderer.
 *
 * Security: the renderer must not choose the spawn executable or cwd.
 * Main binds cwd to the workspace and resolves the shell locally.
 */

export type TerminalStatus = "creating" | "active" | "exited" | "failed";

export interface TerminalCreateOptions {
  cwd?: string;
  shell?: string;
  title?: string;
}

export interface TerminalInfo {
  id: string;
  title: string;
  cwd: string;
  shell: string;
  status: TerminalStatus;
  pid: number | null;
  createdAt: number;
  exitedAt: number | null;
  exitCode: number | null;
}

export interface TerminalOutputLine {
  terminalId: string;
  data: string;
  timestamp: number;
}

export interface TerminalApi {
  create(options?: TerminalCreateOptions): Promise<TerminalInfo>;
  write(terminalId: string, data: string): Promise<void>;
  resize(terminalId: string, cols: number, rows: number): Promise<void>;
  destroy(terminalId: string): Promise<void>;
  getInfo(terminalId: string): Promise<TerminalInfo>;
  list(): Promise<TerminalInfo[]>;
  onOutput(cb: (line: TerminalOutputLine) => void): () => void;
  onExit(cb: (info: TerminalInfo) => void): () => void;
}

export function isTerminalId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}
