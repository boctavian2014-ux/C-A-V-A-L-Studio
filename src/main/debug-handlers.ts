import { ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { parseIpcInput, debugLaunchSchema } from "./ipc-schemas";
import { assertPathInWorkspace } from "./path-security";
import { recordAudit } from "./audit-log";

export interface DebugSession {
  id: string;
  pid: number;
  program: string;
  workspaceRoot: string;
}

const sessions = new Map<string, { child: ChildProcessWithoutNullStreams; session: DebugSession }>();

async function loadLaunchConfig(workspaceRoot: string): Promise<{
  program: string;
  args?: string[];
  cwd?: string;
} | null> {
  const launchPath = path.join(workspaceRoot, ".vscode", "launch.json");
  try {
    const raw = await fs.readFile(launchPath, "utf8");
    const json = JSON.parse(raw) as {
      configurations?: Array<{ type?: string; program?: string; args?: string[]; cwd?: string }>;
    };
    const nodeCfg = json.configurations?.find((c) => c.type === "node" && c.program);
    if (!nodeCfg?.program) return null;
    return {
      program: nodeCfg.program,
      args: nodeCfg.args,
      cwd: nodeCfg.cwd ?? workspaceRoot,
    };
  } catch {
    return null;
  }
}

export function registerDebugHandlers(getWorkspaceRoot: (senderId: number) => string): void {
  ipcMain.handle("debug:launch", async (event, input?: unknown) => {
    const root = getWorkspaceRoot(event.sender.id);
    if (!root?.trim()) return { ok: false, error: "No workspace open" };

    let program: string;
    let args: string[] = [];
    let cwd = root;

    if (input) {
      const parsed = parseIpcInput(debugLaunchSchema, { workspaceRoot: root, ...(input as object) });
      program = parsed.program;
      args = parsed.args ?? [];
      cwd = parsed.cwd ?? root;
    } else {
      const launch = await loadLaunchConfig(root);
      if (!launch) {
        return { ok: false, error: "No .vscode/launch.json Node configuration found" };
      }
      program = launch.program;
      args = launch.args ?? [];
      cwd = launch.cwd ?? root;
    }

    try {
      const resolvedProgram = path.isAbsolute(program)
        ? program
        : path.join(root, program);
      assertPathInWorkspace(root, resolvedProgram);
      assertPathInWorkspace(root, cwd);

      const child = spawn(process.execPath, [resolvedProgram, ...args], {
        cwd,
        env: { ...process.env, NODE_OPTIONS: "--inspect-brk=9229" },
        stdio: "pipe",
      }) as ChildProcessWithoutNullStreams;

      const sessionId = `dbg-${Date.now()}`;
      const session: DebugSession = {
        id: sessionId,
        pid: child.pid ?? -1,
        program: resolvedProgram,
        workspaceRoot: root,
      };
      sessions.set(sessionId, { child, session });

      child.on("exit", () => sessions.delete(sessionId));

      recordAudit({
        channel: "debug:launch",
        action: "launch",
        workspaceRoot: root,
        detail: resolvedProgram,
        ok: true,
      });

      return { ok: true, session, inspectPort: 9229 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordAudit({
        channel: "debug:launch",
        action: "launch",
        workspaceRoot: root,
        detail: message,
        ok: false,
      });
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("debug:stop", async (_event, sessionId: string) => {
    const entry = sessions.get(sessionId);
    if (!entry) return { ok: false, error: "Session not found" };
    entry.child.kill();
    sessions.delete(sessionId);
    return { ok: true };
  });

  ipcMain.handle("debug:list", async () => {
    return {
      ok: true,
      sessions: [...sessions.values()].map((e) => e.session),
    };
  });

  ipcMain.handle("debug:launch-config", async (event) => {
    const root = getWorkspaceRoot(event.sender.id);
    if (!root?.trim()) return { ok: false, error: "No workspace" };
    const config = await loadLaunchConfig(root);
    return { ok: true, config };
  });
}
