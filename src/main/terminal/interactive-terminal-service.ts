import { spawnSync } from "node:child_process";
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
  kill(signal?: string): void;
  onData(cb: (data: string) => void): void;
  onExit?(cb: (event: { exitCode: number; signal?: number }) => void): void;
}

export interface PtyKillDeps {
  platform?: NodeJS.Platform;
  spawnSyncFn?: typeof spawnSync;
  killGroupFn?: (pid: number, signal: NodeJS.Signals) => void;
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
  killDeps?: PtyKillDeps;
}

function disposePtyHandle(sessionPty: InteractivePty, platform: NodeJS.Platform): void {
  // node-pty WindowsTerminal.kill(signal) throws "Signals not supported on windows"
  // from a deferred socket callback — the throw is uncaught after [shutdown] complete
  // and was the Electron child exit 1 on Windows smoke (#77).
  if (platform === "win32") {
    sessionPty.kill();
    return;
  }
  sessionPty.kill("SIGKILL");
}

/**
 * Kill a PTY and its descendants.
 * Windows: taskkill /T /F while the PTY is still alive so shell children are not orphaned.
 * POSIX: SIGKILL the process group (PTY is typically the leader); fall back to pty.kill.
 */
export function killPtyProcess(sessionPty: InteractivePty, deps: PtyKillDeps = {}): void {
  const platform = deps.platform ?? process.platform;
  const pid = sessionPty.pid;

  try {
    if (typeof pid === "number" && pid > 1 && platform === "win32") {
      const run = deps.spawnSyncFn ?? spawnSync;
      run("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
        timeout: 8_000,
      });
      try {
        disposePtyHandle(sessionPty, platform);
      } catch {
        // PTY handle already gone
      }
      return;
    }

    if (typeof pid === "number" && pid > 1) {
      const killGroup =
        deps.killGroupFn ??
        ((groupPid: number, signal: NodeJS.Signals) => {
          process.kill(-groupPid, signal);
        });
      try {
        killGroup(pid, "SIGKILL");
      } catch {
        disposePtyHandle(sessionPty, platform);
        return;
      }
    }

    disposePtyHandle(sessionPty, platform);
  } catch {
    try {
      disposePtyHandle(sessionPty, platform);
    } catch {
      // best-effort
    }
  }
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
  private readonly killDeps: PtyKillDeps;

  constructor(options: InteractiveTerminalServiceOptions = {}) {
    this.spawnFn = options.spawnFn ?? defaultSpawn;
    this.resolveShell = options.resolveShell ?? resolvePreferredShell;
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? defaultId;
    this.killDeps = options.killDeps ?? {};
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
      killPtyProcess(session.pty, this.killDeps);
      this.sessions.delete(id);
    }
    return { ok: true };
  }

  destroyAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.destroy(id);
    }
  }

  /** Blocking kill for `window-all-closed` — must finish before `app.quit()`. */
  stopAllInteractiveTerminalsSync(): void {
    const sessions = [...this.sessions.values()];
    for (const session of sessions) {
      try {
        killPtyProcess(session.pty, this.killDeps);
      } catch {
        // best-effort
      }
    }
    this.sessions.clear();
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

export function stopAllInteractiveTerminalsSync(): void {
  interactiveTerminalService.stopAllInteractiveTerminalsSync();
}
