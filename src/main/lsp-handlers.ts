import { ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { assertPathInWorkspace } from "./path-security";
import { assertTrustedSender } from "./ipc-trust";
import {
  requireBoundWorkspaceRoot,
  type BoundWorkspaceRootGetter,
} from "./bound-workspace";
import { sanitizeEnvForTerminal } from "./subprocess-env";
import { shutdownMark } from "./shutdown-diagnostics";
import { stopChildProcessAndWait } from "./wait-for-exit";

interface LspSession {
  id: string;
  languageId: string;
  workspaceRoot: string;
  process: ChildProcessWithoutNullStreams | null;
  running: boolean;
  error?: string;
}

const sessions = new Map<string, LspSession>();

export const LSP_STOP_TIMEOUT_MS = 8_000;

async function stopLspSession(session: LspSession, timeoutMs: number): Promise<void> {
  const child = session.process;
  if (!child) {
    session.running = false;
    return;
  }
  shutdownMark("lsp-stop", { sessionId: session.id, pid: child.pid ?? null });
  const result = await stopChildProcessAndWait(child, timeoutMs);
  shutdownMark("lsp-stop-result", { sessionId: session.id, result, pid: child.pid ?? null });
  session.running = false;
  session.process = null;
}

export async function stopAllLspSessions(timeoutMs = LSP_STOP_TIMEOUT_MS): Promise<void> {
  const active = [...sessions.values()];
  shutdownMark("lsp-stop-all", { count: active.filter((session) => session.process).length });
  await Promise.all(active.map((session) => stopLspSession(session, timeoutMs)));
}

/** Test seam: attach a child without going through lsp:start IPC. */
export function attachLspProcessForTests(
  sessionId: string,
  child: ChildProcessWithoutNullStreams
): void {
  sessions.set(sessionId, {
    id: sessionId,
    languageId: "typescript",
    workspaceRoot: ".",
    process: child,
    running: true,
  });
}

function languageServerCommand(languageId: string): { command: string; args: string[] } | null {
  switch (languageId) {
    case "typescript":
    case "javascript":
    case "typescriptreact":
    case "javascriptreact":
      return {
        command: process.platform === "win32" ? "typescript-language-server.cmd" : "typescript-language-server",
        args: ["--stdio"],
      };
    case "python":
      return {
        command: process.platform === "win32" ? "pyright-langserver.cmd" : "pyright-langserver",
        args: ["--stdio"],
      };
    default:
      return null;
  }
}

export function registerLspHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter): void {
  ipcMain.handle("lsp:start", async (event, languageId: string) => {
    assertTrustedSender(event);
    let root: string;
    try {
      root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    const spec = languageServerCommand(languageId);
    if (!spec) return { ok: false, error: `No LSP for language: ${languageId}` };

    const sessionId = `lsp-${languageId}`;
    const existing = sessions.get(sessionId);
    if (existing?.running) {
      return { ok: true, sessionId, running: true };
    }

    try {
      assertPathInWorkspace(root, root);
      const child = spawn(spec.command, spec.args, {
        cwd: root,
        stdio: "pipe",
        env: sanitizeEnvForTerminal(),
        shell: false,
        windowsHide: true,
      }) as ChildProcessWithoutNullStreams;

      const session: LspSession = {
        id: sessionId,
        languageId,
        workspaceRoot: root,
        process: child,
        running: true,
      };

      child.on("exit", () => {
        session.running = false;
        session.process = null;
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        session.error = chunk.toString().slice(-500);
      });

      sessions.set(sessionId, session);
      return { ok: true, sessionId, running: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("lsp:stop", async (event, sessionId: string) => {
    assertTrustedSender(event);
    const session = sessions.get(sessionId);
    if (!session?.process) return { ok: false, error: "Session not found" };
    await stopLspSession(session, LSP_STOP_TIMEOUT_MS);
    return { ok: true };
  });

  ipcMain.handle("lsp:status", async (event) => {
    assertTrustedSender(event);
    return {
      ok: true,
      servers: [...sessions.values()].map((s) => ({
        id: s.id,
        languageId: s.languageId,
        running: s.running,
        workspaceRoot: s.workspaceRoot,
        error: s.error,
      })),
    };
  });

  ipcMain.handle("lsp:resolve-definition", async (event, input: {
    languageId: string;
    filePath: string;
    line: number;
    column: number;
    symbol?: string;
  }) => {
    assertTrustedSender(event);
    try {
      requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    const sessionId = `lsp-${input.languageId}`;
    const session = sessions.get(sessionId);
    if (!session?.running) {
      return {
        ok: true,
        location: {
          filePath: input.filePath,
          line: input.line,
          column: input.column,
          source: "fallback",
        },
      };
    }

    return {
      ok: true,
      location: {
        filePath: input.filePath,
        line: input.line,
        column: input.column,
        source: "lsp-stub",
        symbol: input.symbol,
      },
    };
  });
}
