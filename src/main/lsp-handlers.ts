import { ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

import { assertPathInWorkspace } from "./path-security";

interface LspSession {
  id: string;
  languageId: string;
  workspaceRoot: string;
  process: ChildProcessWithoutNullStreams | null;
  running: boolean;
  error?: string;
}

const sessions = new Map<string, LspSession>();

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

export function registerLspHandlers(getWorkspaceRoot: (senderId: number) => string): void {
  ipcMain.handle("lsp:start", async (event, languageId: string) => {
    const root = getWorkspaceRoot(event.sender.id);
    if (!root?.trim()) return { ok: false, error: "No workspace open" };

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
        env: process.env,
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

  ipcMain.handle("lsp:stop", async (_event, sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session?.process) return { ok: false, error: "Session not found" };
    session.process.kill();
    session.running = false;
    session.process = null;
    return { ok: true };
  });

  ipcMain.handle("lsp:status", async () => {
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
    const root = getWorkspaceRoot(event.sender.id);
    if (!root?.trim()) return { ok: false, error: "No workspace" };

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
