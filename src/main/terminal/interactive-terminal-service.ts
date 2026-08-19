import { randomUUID } from "node:crypto";
import * as pty from "node-pty";

import type { TerminalInfo } from "../../shared/terminal-contract";
import {
  resolvePreferredShell,
  type ResolvedShell,
} from "../powershell-shell";
import { sanitizeEnvForTerminal } from "../subprocess-env";

export interface InteractivePty {
  pid?: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: string) => void): void;
  onExit?(cb: (event: { exitCode: number; signal?: number }) => void): void;
}

export interface InteractivePtySpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

export type InteractivePtySpawn = (
  file: string,
  args: string[],
  options: InteractivePtySpawnOptions
) => InteractivePty;

/**
 * Main-owned spawn input. `cwd` must already be the bound workspace.
 * Renderer `shell` is never accepted here — handlers resolve the shell locally.
 */
export interface SpawnTerminalInput {
  id?: string;
  cwd: string;
  title?: string;
  onData: (data: string) => void;
  onExit?: (info: TerminalInfo) => void;
}

interface SessionRecord {
  pty: InteractivePty;
  info: TerminalInfo;
}

export interface InteractiveTerminalServiceOptions {
  spawnFn?: InteractivePtySpawn;
  resolveShell?: () => ResolvedShell;
  now?: () => number;
  idFactory?: () => string;
}

function defaultSpawn(
  file: string,
  args: string[],
  options: InteractivePtySpawnOptions
): InteractivePty {
  return pty.spawn(file, args, options);
}

function defaultId(): string {
  return `term-${randomUUID()}`;
}

export class InteractiveTerminalService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly spawnFn: InteractivePtySpawn;
  private readonly resolveShell: () => ResolvedShell;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(options: InteractiveTerminalServiceOptions = {}) {
    this.spawnFn = options.spawnFn ?? defaultSpawn;
    this.resolveShell = options.resolveShell ?? resolvePreferredShell;
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? defaultId;
  }

  create(input: SpawnTerminalInput): TerminalInfo {
    const id = input.id?.trim() || this.idFactory();
    this.destroy(id);
    const shell = this.resolveShell();
    const createdAt = this.now();
    const session = this.spawnFn(shell.command, shell.interactiveArgs, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: input.cwd,
      env: sanitizeEnvForTerminal() as Record<string, string>,
    });
    const info: TerminalInfo = {
      id,
      title: input.title?.trim() || shell.label,
      cwd: input.cwd,
      shell: shell.label,
      status: "active",
      pid: typeof session.pid === "number" ? session.pid : null,
      createdAt,
      exitedAt: null,
      exitCode: null,
    };
    session.onData(input.onData);
    session.onExit?.(({ exitCode }) => {
      const current = this.sessions.get(id);
      if (!current) return;
      current.info = {
        ...current.info,
        status: "exited",
        exitedAt: this.now(),
        exitCode,
      };
      this.sessions.delete(id);
      input.onExit?.(current.info);
    });
    this.sessions.set(id, { pty: session, info });
    return info;
  }

  write(id: string, data: string): { ok: boolean; error?: string } {
    const session = this.sessions.get(id);
    if (!session) return { ok: false, error: "Session not found" };
    session.pty.write(data);
    return { ok: true };
  }

  resize(id: string, cols: number, rows: number): { ok: boolean; skipped?: boolean } {
    const session = this.sessions.get(id);
    if (!session) return { ok: false };
    const safeCols = Math.floor(cols);
    const safeRows = Math.floor(rows);
    if (safeCols < 1 || safeRows < 1) return { ok: false, skipped: true };
    session.pty.resize(safeCols, safeRows);
    return { ok: true };
  }

  getInfo(id: string): TerminalInfo | null {
    return this.sessions.get(id)?.info ?? null;
  }

  list(): TerminalInfo[] {
    return [...this.sessions.values()].map((session) => session.info);
  }

  destroy(id: string): { ok: true } {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.pty.kill();
      } catch {
        /* ignore */
      }
      this.sessions.delete(id);
    }
    return { ok: true };
  }

  destroyAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.destroy(id);
    }
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }
}

export const interactiveTerminalService = new InteractiveTerminalService();

export function stopAllInteractiveTerminals(): void {
  interactiveTerminalService.destroyAll();
}
