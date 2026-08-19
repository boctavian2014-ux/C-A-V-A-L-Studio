import { ipcMain, BrowserWindow, dialog, type IpcMainInvokeEvent } from "electron";
import * as path from "path";
import fs from "node:fs/promises";
import fsSync from "node:fs";

import { applyHunkToContent } from "../shared/diff-utils";
import type { GitCommitInput, GitCommitResult, GitDiffResult } from "../shared/git-contract";
import { GIT_CHANNELS } from "../shared/git-ipc-channels";
import {
  isValidBranchName,
  isValidCommitMessage,
  isValidFilePathArray,
} from "../shared/git-security";
import { normalizeGithubRepoUrl, repoTargetPath } from "./github-clone";
import { assertTrustedSender } from "./ipc-trust";
import {
  requireBoundWorkspaceRootFromEvent,
  type BoundWorkspaceRootGetter,
} from "./bound-workspace";
import { gitExecFile, isGitRepo } from "./git-exec";
import { gitService, toWorkspaceGitPath } from "./git/git-service";
import { resolveSandboxedWorkspacePath } from "./path-security";
import { workspaceGitMutex } from "../../ai/tools/workspace-execute-lock";

function broadcastToAllWindows(channel: string, payload: unknown): void {
  const windows =
    typeof BrowserWindow.getAllWindows === "function" ? BrowserWindow.getAllWindows() : [];
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

let listenersRegistered = false;

function languageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
  };
  return map[ext] ?? "plaintext";
}

async function gitShowFile(cwd: string, rev: string, filePath: string): Promise<string> {
  try {
    const { stdout } = await gitExecFile(cwd, ["show", `${rev}:${filePath}`], {
      allowNonZero: true,
    });
    return stdout;
  } catch {
    return "";
  }
}

async function confirmGitAction(
  event: IpcMainInvokeEvent,
  message: string,
  detail: string
): Promise<boolean> {
  const win = BrowserWindow.fromWebContents(event.sender);
  const choice = win
    ? await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["Confirmă", "Anulează"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        message,
        detail,
      })
    : await dialog.showMessageBox({
        type: "warning",
        buttons: ["Confirmă", "Anulează"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        message,
        detail,
      });
  return choice.response === 0;
}

function parseFiles(a: unknown, b: unknown): string[] {
  if (Array.isArray(a)) {
    return a.filter((item): item is string => typeof item === "string");
  }
  if (typeof b === "string" && b.trim()) return [b];
  return [];
}

function parseCommitInput(a: unknown, b: unknown): GitCommitInput {
  if (a && typeof a === "object" && !Array.isArray(a) && "message" in a) {
    const input = a as GitCommitInput;
    return {
      message: String(input.message ?? ""),
      files: Array.isArray(input.files) ? input.files.filter((item) => typeof item === "string") : undefined,
    };
  }
  if (typeof b === "string") return { message: b };
  if (typeof a === "string") return { message: a };
  return { message: "" };
}

function parseBranch(a: unknown, b: unknown): string {
  if (typeof b === "string" && b.trim()) return b;
  if (typeof a === "string") return a;
  return "";
}

function parseLogLimit(a: unknown, b: unknown): number {
  if (typeof a === "number") return a;
  if (typeof b === "number") return b;
  return 50;
}

function isValidLogLimit(limit: unknown): limit is number {
  return typeof limit === "number" && Number.isInteger(limit) && limit >= 1 && limit <= 1000;
}

/**
 * Lot B Zone C: all git IPC uses bound workspace root exclusively.
 * Renderer `projectPath` is ignored for cwd.
 */
export function registerGitHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter) {
  if (!listenersRegistered) {
    gitService.on("status-changed", (status) => {
      try {
        broadcastToAllWindows(GIT_CHANNELS.statusChanged, status);
      } catch {
        // best-effort fan-out
      }
    });
    gitService.on("operation-changed", (state) => {
      try {
        broadcastToAllWindows(GIT_CHANNELS.operationChanged, state);
      } catch {
        // best-effort fan-out
      }
    });
    listenersRegistered = true;
  }

  const boundRoot = (event: IpcMainInvokeEvent): string =>
    requireBoundWorkspaceRootFromEvent(
      event,
      getBoundWorkspaceRoot,
      "Deschide un folder în workspace înainte de operații Git."
    );

  const handle: typeof ipcMain.handle = ((channel, listener) => {
    return ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      assertTrustedSender(event);
      return (listener as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown)(
        event,
        ...args
      );
    });
  }) as typeof ipcMain.handle;

  const withGitLock = async <T>(root: string, fn: () => Promise<T>): Promise<T> =>
    workspaceGitMutex.runExclusive(root, fn);

  handle(GIT_CHANNELS.status, async (event): Promise<ReturnType<typeof gitService.status>> => {
    const root = boundRoot(event);
    return gitService.status(root);
  });

  handle(GIT_CHANNELS.diff, async (event, a?: unknown, b?: unknown, c?: unknown): Promise<string | GitDiffResult> => {
    const root = boundRoot(event);
    const gitPanelStyle = typeof c === "boolean" && typeof b === "string";
    if (gitPanelStyle) {
      const result = await gitService.diff(root, b, c);
      return result.diff;
    }
    if (a !== undefined && (typeof a !== "string" || !isValidFilePathArray([a]))) {
      throw new TypeError("Invalid file path");
    }
    return gitService.diff(root, a as string | undefined, b === true);
  });

  handle(
    GIT_CHANNELS.filePair,
    async (
      event,
      _projectPath: string,
      filePath: string,
      staged: boolean
    ): Promise<{ original: string; modified: string; language: string }> => {
      const root = boundRoot(event);
      const rel = toWorkspaceGitPath(root, filePath);
      const absPath = resolveSandboxedWorkspacePath(root, rel);
      const language = languageFromPath(rel);

      if (!(await isGitRepo(root))) {
        let modified = "";
        try {
          modified = await fs.readFile(absPath, "utf8");
        } catch {
          modified = "";
        }
        return { original: "", modified, language };
      }

      if (staged) {
        const original = await gitShowFile(root, "HEAD", rel);
        let modified = "";
        try {
          const shown = await gitExecFile(root, ["show", `:${rel}`], { allowNonZero: true });
          modified = shown.stdout;
        } catch {
          modified = "";
        }
        return { original, modified, language };
      }

      const original = await gitShowFile(root, "HEAD", rel);
      let modified = "";
      try {
        modified = await fs.readFile(absPath, "utf8");
      } catch {
        modified = "";
      }
      return { original, modified, language };
    }
  );

  handle(
    GIT_CHANNELS.revertHunk,
    async (
      event,
      _projectPath: string,
      filePath: string,
      hunkPatch: string
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        const confirmed = await confirmGitAction(
          event,
          "Anulezi hunk-ul selectat?",
          "Modificările din acest hunk vor fi reverse-aplicate pe disc."
        );
        if (!confirmed) return { ok: false, error: "Anulat de utilizator." };

        return await withGitLock(root, async () => {
          const rel = toWorkspaceGitPath(root, filePath);
          const absPath = resolveSandboxedWorkspacePath(root, rel);
          const current = await fs.readFile(absPath, "utf8").catch(() => "");
          const next = applyHunkToContent(current, hunkPatch, "reverse");
          await fs.mkdir(path.dirname(absPath), { recursive: true });
          await fs.writeFile(absPath, next, "utf8");
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: gitService.formatError(err) };
      }
    }
  );

  handle(GIT_CHANNELS.stage, async (event, a?: unknown, b?: unknown) => {
    if (Array.isArray(a)) {
      if (!isValidFilePathArray(a)) throw new TypeError("Invalid file paths");
      const root = boundRoot(event);
      return withGitLock(root, () => gitService.stage(root, a));
    }
    try {
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        await gitService.stage(root, parseFiles(a, b));
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.unstage, async (event, a?: unknown, b?: unknown) => {
    if (Array.isArray(a)) {
      if (!isValidFilePathArray(a)) throw new TypeError("Invalid file paths");
      const root = boundRoot(event);
      return withGitLock(root, () => gitService.unstage(root, a));
    }
    try {
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        await gitService.unstage(root, parseFiles(a, b));
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.discardChanges, async (event, files: unknown) => {
    if (!isValidFilePathArray(files)) throw new TypeError("Invalid file paths");
    const root = boundRoot(event);
    return withGitLock(root, () => gitService.discardChanges(root, files));
  });

  handle(GIT_CHANNELS.stageAll, async (event) => {
    try {
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        await gitService.stageAll(root);
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.unstageAll, async (event) => {
    try {
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        await gitService.unstageAll(root);
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.discard, async (event, _projectPath: string, filePath: string) => {
    try {
      const root = boundRoot(event);
      const rel = toWorkspaceGitPath(root, filePath);
      const confirmed = await confirmGitAction(
        event,
        `Discard modificările pentru ${rel}?`,
        "Modificările din working tree pentru acest fișier vor fi pierdute."
      );
      if (!confirmed) return { ok: false, error: "Anulat de utilizator." };

      return await withGitLock(root, async () => {
        await gitService.discard(root, rel);
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.commit, async (event, a?: unknown, b?: unknown): Promise<GitCommitResult | { ok: boolean; hash?: string; error?: string }> => {
    if (a && typeof a === "object" && !Array.isArray(a)) {
      const { message, files } = a as { message?: unknown; files?: unknown };
      if (!isValidCommitMessage(message)) throw new TypeError("Invalid commit message");
      if (files !== undefined && !isValidFilePathArray(files)) throw new TypeError("Invalid file paths");
      const root = boundRoot(event);
      return withGitLock(root, () =>
        gitService.commit(root, { message, files: files as string[] | undefined })
      );
    }
    const input = parseCommitInput(a, b);
    try {
      if (!isValidCommitMessage(input.message)) {
        throw new Error("Mesajul commit-ului este gol.");
      }
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        const result = await gitService.commit(root, input);
        return { ok: true, hash: result.hash };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.push, async (event, _projectPath?: string, setUpstream?: boolean) => {
    try {
      const root = boundRoot(event);
      const confirmed = await confirmGitAction(
        event,
        "Push către remote?",
        "Această operație contactează remote-ul Git (rețea)."
      );
      if (!confirmed) return { ok: false, error: "Anulat de utilizator." };

      return await withGitLock(root, async () => {
        await gitService.push(root, setUpstream);
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.pull, async (event) => {
    try {
      const root = boundRoot(event);
      const confirmed = await confirmGitAction(
        event,
        "Pull de pe remote?",
        "Această operație contactează remote-ul Git (rețea) și poate modifica working tree."
      );
      if (!confirmed) return { ok: false, error: "Anulat de utilizator." };

      return await withGitLock(root, async () => {
        await gitService.pull(root);
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.log, async (event, a?: unknown, b?: unknown) => {
    const root = boundRoot(event);
    if (typeof a === "number" || a === undefined) {
      if (a !== undefined && !isValidLogLimit(a)) {
        throw new TypeError("Invalid log limit");
      }
      return gitService.log(root, a);
    }
    const limit = parseLogLimit(a, b);
    if (b !== undefined && !isValidLogLimit(limit)) {
      throw new TypeError("Invalid log limit");
    }
    return gitService.log(root, limit);
  });

  handle(GIT_CHANNELS.branches, async (event) => {
    const root = boundRoot(event);
    return gitService.branches(root);
  });

  handle(GIT_CHANNELS.checkout, async (event, a?: unknown, b?: unknown) => {
    if (b === undefined) {
      if (!isValidBranchName(a)) throw new TypeError("Invalid branch name");
      const root = boundRoot(event);
      return withGitLock(root, () => gitService.checkout(root, a));
    }
    try {
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        await gitService.checkout(root, parseBranch(a, b));
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.createBranch, async (event, name: unknown, from: unknown) => {
    if (isValidBranchName(name)) {
      if (from !== undefined && !isValidBranchName(from)) {
        throw new TypeError("Invalid source branch name");
      }
      const root = boundRoot(event);
      return withGitLock(root, () => gitService.createBranch(root, name, from as string | undefined));
    }
    try {
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        await gitService.createBranch(root, parseBranch(name, from));
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.createBranchLegacy, async (event, a?: unknown, b?: unknown) => {
    try {
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        await gitService.createBranch(root, parseBranch(a, b));
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.init, async (event) => {
    try {
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        await gitService.init(root);
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.stash, async (event, _projectPath: string, message?: string) => {
    try {
      const root = boundRoot(event);
      return await withGitLock(root, async () => {
        await gitService.stash(root, message);
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(GIT_CHANNELS.stashPop, async (event) => {
    try {
      const root = boundRoot(event);
      const confirmed = await confirmGitAction(
        event,
        "Aplică stash (stash pop)?",
        "Poate produce conflicte sau modifica fișierele din working tree."
      );
      if (!confirmed) return { ok: false, error: "Anulat de utilizator." };

      return await withGitLock(root, async () => {
        await gitService.stashPop(root);
        return { ok: true };
      });
    } catch (err: unknown) {
      return { ok: false, error: gitService.formatError(err) };
    }
  });

  handle(
    GIT_CHANNELS.clone,
    async (
      event,
      input: { url: string; parentDir?: string }
    ): Promise<{ ok: boolean; path?: string; error?: string }> => {
      try {
        const bound = getBoundWorkspaceRoot(event.sender.id)?.trim();

        const normalized = normalizeGithubRepoUrl(input.url);
        if (!normalized) {
          return {
            ok: false,
            error: "URL GitHub invalid. Folosește owner/repo sau https://github.com/owner/repo",
          };
        }

        const confirmed = await confirmGitAction(
          event,
          "Clone repo de pe GitHub?",
          `Remote: ${normalized.cloneUrl}`
        );
        if (!confirmed) return { ok: false, error: "Anulat de utilizator." };

        let parentDir = input.parentDir?.trim();
        if (parentDir) {
          if (!bound) {
            return { ok: false, error: "Deschide un folder înainte de clone cu parentDir din renderer." };
          }
          try {
            parentDir = resolveSandboxedWorkspacePath(bound, parentDir);
          } catch {
            return { ok: false, error: "parentDir trebuie să fie în workspace-ul legat." };
          }
        } else {
          const win = BrowserWindow.fromWebContents(event.sender);
          const picked = win
            ? await dialog.showOpenDialog(win, {
                title: "Alege folderul unde se clonează repo-ul",
                properties: ["openDirectory", "createDirectory"],
              })
            : await dialog.showOpenDialog({
                title: "Alege folderul unde se clonează repo-ul",
                properties: ["openDirectory", "createDirectory"],
              });
          if (picked.canceled || !picked.filePaths[0]) {
            return { ok: false, error: "Clone anulat" };
          }
          parentDir = picked.filePaths[0];
        }

        const target = repoTargetPath(parentDir, normalized.repo);
        const resolvedParent = path.resolve(parentDir);
        const resolvedTarget = path.resolve(target);
        if (
          !resolvedTarget.startsWith(resolvedParent + path.sep) &&
          resolvedTarget !== resolvedParent
        ) {
          return { ok: false, error: "Cale destinație invalidă" };
        }
        if (fsSync.existsSync(resolvedTarget)) {
          return { ok: false, error: `Folderul există deja: ${resolvedTarget}` };
        }

        try {
          await gitExecFile(resolvedParent, ["--version"], { timeoutMs: 15_000 });
        } catch {
          return { ok: false, error: "Git nu este instalat sau nu e în PATH" };
        }

        const lockKey = bound ?? resolvedParent;
        return await withGitLock(lockKey, async () => {
          await gitExecFile(
            resolvedParent,
            ["clone", "--depth", "1", normalized.cloneUrl, resolvedTarget],
            { timeoutMs: 300_000, maxBuffer: 20 * 1024 * 1024 }
          );
          return { ok: true, path: resolvedTarget };
        });
      } catch (err: unknown) {
        return { ok: false, error: gitService.formatError(err) };
      }
    }
  );
}
