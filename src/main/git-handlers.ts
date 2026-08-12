import { ipcMain, BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { applyHunkToContent } from '../shared/diff-utils';
import { normalizeGithubRepoUrl, repoTargetPath } from './github-clone';
import { assertTrustedSender } from './ipc-trust';
import {
  requireBoundWorkspaceRootFromEvent,
  type BoundWorkspaceRootGetter,
} from './bound-workspace';
import { gitExecFile, isGitRepo } from './git-exec';
import { resolveSandboxedWorkspacePath } from './path-security';
import { workspaceGitMutex } from '../../ai/tools/workspace-execute-lock';
import { redactSensitiveCommandOutput } from '../shared/command-output-redaction';

// ──────────────────────────────────────────────
//  Git IPC Handlers — CAVALLO Studio (Lot B)
//  cwd exclusively from getBoundWorkspaceRoot.
//  git via execFile argv — never string exec.
// ──────────────────────────────────────────────

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
  oldPath?: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  refs: string;
}

export interface GitStatus {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  isRepo: boolean;
}

function parseStatus(raw: string): GitFileStatus[] {
  const files: GitFileStatus[] = [];
  const lines = raw.split('\n').filter(Boolean);

  for (const line of lines) {
    const xy = line.substring(0, 2);
    const rest = line.substring(3);
    const X = xy[0];
    const Y = xy[1];

    if (X === 'R' || Y === 'R') {
      const parts = rest.split(' -> ');
      files.push({ path: parts[1] || rest, oldPath: parts[0], status: 'R', staged: X === 'R' });
      continue;
    }

    if (X === '?' && Y === '?') {
      files.push({ path: rest, status: '?', staged: false });
      continue;
    }

    if (X !== ' ' && X !== '?') {
      files.push({ path: rest, status: X, staged: true });
    }

    if (Y !== ' ' && Y !== '?') {
      const existing = files.find((f) => f.path === rest && !f.staged);
      if (!existing) {
        files.push({ path: rest, status: Y, staged: false });
      }
    }
  }

  return files;
}

function parseLog(raw: string): GitCommit[] {
  if (!raw.trim()) return [];
  const commits = raw.split('\x00').filter(Boolean);
  return commits.map((block) => {
    const parts = block.split('\x1f');
    return {
      hash: parts[0] || '',
      shortHash: (parts[0] || '').substring(0, 7),
      subject: parts[1] || '',
      author: parts[2] || '',
      date: parts[3] || '',
      refs: parts[4] || '',
    };
  });
}

function languageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript',
    '.json': 'json', '.md': 'markdown',
    '.css': 'css', '.scss': 'scss', '.html': 'html',
    '.py': 'python', '.go': 'go', '.rs': 'rust',
  };
  return map[ext] ?? 'plaintext';
}

function safeRelPath(filePath: string): string {
  const trimmed = String(filePath ?? '').trim();
  if (!trimmed || trimmed.includes('\0')) {
    throw new Error('Invalid file path');
  }
  if (path.isAbsolute(trimmed) || trimmed.startsWith('..') || trimmed.includes(`${path.sep}..`)) {
    // Still allow relative paths; absolute escapes blocked by resolveSandboxedWorkspacePath
  }
  return trimmed.replace(/\\/g, '/');
}

function validateBranchName(name: string): string {
  const trimmed = String(name ?? '').trim();
  if (!trimmed || /[\s~^:?*\[\\]|@{|\.\./.test(trimmed) || trimmed.startsWith('-')) {
    throw new Error('Invalid branch name');
  }
  return trimmed;
}

async function confirmGitAction(
  event: IpcMainInvokeEvent,
  message: string,
  detail: string
): Promise<boolean> {
  const win = BrowserWindow.fromWebContents(event.sender);
  const choice = win
    ? await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Confirmă', 'Anulează'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        message,
        detail,
      })
    : await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Confirmă', 'Anulează'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        message,
        detail,
      });
  return choice.response === 0;
}

async function gitShowFile(cwd: string, rev: string, filePath: string): Promise<string> {
  try {
    const { stdout } = await gitExecFile(cwd, ['show', `${rev}:${filePath}`], {
      allowNonZero: true,
    });
    return stdout;
  } catch {
    return '';
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return redactSensitiveCommandOutput(err.message);
  return redactSensitiveCommandOutput(String(err));
}

/**
 * Lot B Zone C: all git IPC uses bound workspace root exclusively.
 * Renderer `projectPath` is ignored for cwd.
 */
export function registerGitHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter) {
  const boundRoot = (event: IpcMainInvokeEvent): string =>
    requireBoundWorkspaceRootFromEvent(
      event,
      getBoundWorkspaceRoot,
      'Deschide un folder în workspace înainte de operații Git.'
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

  handle('git:status', async (event, _projectPath?: string): Promise<GitStatus> => {
    const root = boundRoot(event);
    if (!(await isGitRepo(root))) {
      return { branch: '', upstream: null, ahead: 0, behind: 0, files: [], isRepo: false };
    }

    const branchRaw = await gitExecFile(root, ['branch', '--show-current'], { allowNonZero: true });
    const branch = branchRaw.stdout.trim() || 'HEAD detached';

    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;

    try {
      const upstreamRaw = await gitExecFile(root, [
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        '@{u}',
      ]);
      upstream = upstreamRaw.stdout.trim();

      const revListRaw = await gitExecFile(root, [
        'rev-list',
        '--count',
        '--left-right',
        '@{u}...HEAD',
      ]);
      const [b, a] = revListRaw.stdout.trim().split('\t').map(Number);
      ahead = a || 0;
      behind = b || 0;
    } catch {
      // no upstream
    }

    const statusRaw = await gitExecFile(root, ['status', '--porcelain=v1', '-u'], {
      allowNonZero: true,
    });
    return {
      branch,
      upstream,
      ahead,
      behind,
      files: parseStatus(statusRaw.stdout),
      isRepo: true,
    };
  });

  handle(
    'git:diff',
    async (event, _projectPath: string, filePath: string, staged: boolean): Promise<string> => {
      const root = boundRoot(event);
      if (!(await isGitRepo(root))) return '';
      const rel = safeRelPath(filePath);
      resolveSandboxedWorkspacePath(root, rel);

      const args = staged
        ? ['diff', '--staged', '--', rel]
        : ['diff', '--', rel];
      const raw = await gitExecFile(root, args, { allowNonZero: true });

      if (!raw.stdout.trim() && !staged) {
        try {
          const abs = resolveSandboxedWorkspacePath(root, rel);
          const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
          const untracked = await gitExecFile(root, ['diff', '--no-index', nullDevice, abs], {
            allowNonZero: true,
          });
          return untracked.stdout;
        } catch {
          return '';
        }
      }
      return raw.stdout;
    }
  );

  handle(
    'git:filePair',
    async (
      event,
      _projectPath: string,
      filePath: string,
      staged: boolean
    ): Promise<{ original: string; modified: string; language: string }> => {
      const root = boundRoot(event);
      const rel = safeRelPath(filePath);
      const absPath = resolveSandboxedWorkspacePath(root, rel);
      const language = languageFromPath(rel);

      if (!(await isGitRepo(root))) {
        let modified = '';
        try {
          modified = await fs.readFile(absPath, 'utf8');
        } catch {
          modified = '';
        }
        return { original: '', modified, language };
      }

      if (staged) {
        const original = await gitShowFile(root, 'HEAD', rel);
        let modified = '';
        try {
          const shown = await gitExecFile(root, ['show', `:${rel}`], { allowNonZero: true });
          modified = shown.stdout;
        } catch {
          modified = '';
        }
        return { original, modified, language };
      }

      const original = await gitShowFile(root, 'HEAD', rel);
      let modified = '';
      try {
        modified = await fs.readFile(absPath, 'utf8');
      } catch {
        modified = '';
      }
      return { original, modified, language };
    }
  );

  handle(
    'git:revertHunk',
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
          'Anulezi hunk-ul selectat?',
          'Modificările din acest hunk vor fi reverse-aplicate pe disc.'
        );
        if (!confirmed) return { ok: false, error: 'Anulat de utilizator.' };

        return await withGitLock(root, async () => {
          const rel = safeRelPath(filePath);
          const absPath = resolveSandboxedWorkspacePath(root, rel);
          const current = await fs.readFile(absPath, 'utf8').catch(() => '');
          const next = applyHunkToContent(current, hunkPatch, 'reverse');
          await fs.mkdir(path.dirname(absPath), { recursive: true });
          await fs.writeFile(absPath, next, 'utf8');
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:stage',
    async (event, _projectPath: string, filePath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        return await withGitLock(root, async () => {
          const rel = safeRelPath(filePath);
          resolveSandboxedWorkspacePath(root, rel);
          await gitExecFile(root, ['add', '--', rel]);
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:unstage',
    async (event, _projectPath: string, filePath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        return await withGitLock(root, async () => {
          const rel = safeRelPath(filePath);
          resolveSandboxedWorkspacePath(root, rel);
          try {
            await gitExecFile(root, ['restore', '--staged', '--', rel]);
          } catch {
            await gitExecFile(root, ['reset', 'HEAD', '--', rel], { allowNonZero: true });
          }
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:stageAll',
    async (event, _projectPath?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        return await withGitLock(root, async () => {
          await gitExecFile(root, ['add', '-A']);
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:unstageAll',
    async (event, _projectPath?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        return await withGitLock(root, async () => {
          await gitExecFile(root, ['reset', 'HEAD'], { allowNonZero: true });
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:discard',
    async (event, _projectPath: string, filePath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        const rel = safeRelPath(filePath);
        const confirmed = await confirmGitAction(
          event,
          `Discard modificările pentru ${rel}?`,
          'Modificările din working tree pentru acest fișier vor fi pierdute.'
        );
        if (!confirmed) return { ok: false, error: 'Anulat de utilizator.' };

        return await withGitLock(root, async () => {
          resolveSandboxedWorkspacePath(root, rel);
          await gitExecFile(root, ['restore', '--', rel]);
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:commit',
    async (
      event,
      _projectPath: string,
      message: string
    ): Promise<{ ok: boolean; error?: string; hash?: string }> => {
      if (!String(message ?? '').trim()) return { ok: false, error: 'Mesajul commit-ului este gol.' };
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        return await withGitLock(root, async () => {
          const { stdout } = await gitExecFile(root, ['commit', '-m', message]);
          const match = stdout.match(/\[[\w\s/-]+ ([a-f0-9]+)\]/);
          return { ok: true, hash: match?.[1] };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:push',
    async (
      event,
      _projectPath: string,
      setUpstream?: boolean
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        const confirmed = await confirmGitAction(
          event,
          'Push către remote?',
          'Această operație contactează remote-ul Git (rețea).'
        );
        if (!confirmed) return { ok: false, error: 'Anulat de utilizator.' };

        return await withGitLock(root, async () => {
          const args = setUpstream
            ? ['push', '--set-upstream', 'origin', 'HEAD']
            : ['push'];
          await gitExecFile(root, args, { timeoutMs: 180_000 });
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:pull',
    async (event, _projectPath?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        const confirmed = await confirmGitAction(
          event,
          'Pull de pe remote?',
          'Această operație contactează remote-ul Git (rețea) și poate modifica working tree.'
        );
        if (!confirmed) return { ok: false, error: 'Anulat de utilizator.' };

        return await withGitLock(root, async () => {
          await gitExecFile(root, ['pull'], { timeoutMs: 180_000 });
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:log',
    async (event, _projectPath: string, limit = 50): Promise<GitCommit[]> => {
      const root = boundRoot(event);
      if (!(await isGitRepo(root))) return [];
      const n = Math.min(Math.max(Number(limit) || 50, 1), 500);
      const format = '%H%x1f%s%x1f%an%x1f%aI%x1f%D%x00';
      const raw = await gitExecFile(root, ['log', `--format=${format}`, `-n`, String(n)], {
        allowNonZero: true,
      });
      return parseLog(raw.stdout);
    }
  );

  handle('git:branches', async (event, _projectPath?: string): Promise<string[]> => {
    const root = boundRoot(event);
    if (!(await isGitRepo(root))) return [];
    const raw = await gitExecFile(root, ['branch', '--format=%(refname:short)'], {
      allowNonZero: true,
    });
    return raw.stdout.split('\n').map((b) => b.trim()).filter(Boolean);
  });

  handle(
    'git:checkout',
    async (event, _projectPath: string, branch: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        const name = validateBranchName(branch);
        return await withGitLock(root, async () => {
          await gitExecFile(root, ['checkout', name]);
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:createBranch',
    async (event, _projectPath: string, name: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        const branch = validateBranchName(name);
        return await withGitLock(root, async () => {
          await gitExecFile(root, ['checkout', '-b', branch]);
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:init',
    async (event, _projectPath?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        return await withGitLock(root, async () => {
          await gitExecFile(root, ['init']);
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:stash',
    async (
      event,
      _projectPath: string,
      message?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        return await withGitLock(root, async () => {
          const args =
            message && message.trim()
              ? ['stash', 'push', '-m', message.trim()]
              : ['stash'];
          await gitExecFile(root, args);
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:stashPop',
    async (event, _projectPath?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const root = boundRoot(event);
        if (!(await isGitRepo(root))) return { ok: false, error: 'Not a git repository' };
        const confirmed = await confirmGitAction(
          event,
          'Aplică stash (stash pop)?',
          'Poate produce conflicte sau modifica fișierele din working tree.'
        );
        if (!confirmed) return { ok: false, error: 'Anulat de utilizator.' };

        return await withGitLock(root, async () => {
          await gitExecFile(root, ['stash', 'pop']);
          return { ok: true };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );

  handle(
    'git:clone',
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
            error: 'URL GitHub invalid. Folosește owner/repo sau https://github.com/owner/repo',
          };
        }

        const confirmed = await confirmGitAction(
          event,
          'Clone repo de pe GitHub?',
          `Remote: ${normalized.cloneUrl}`
        );
        if (!confirmed) return { ok: false, error: 'Anulat de utilizator.' };

        let parentDir = input.parentDir?.trim();
        if (parentDir) {
          if (!bound) {
            return { ok: false, error: 'Deschide un folder înainte de clone cu parentDir din renderer.' };
          }
          try {
            parentDir = resolveSandboxedWorkspacePath(bound, parentDir);
          } catch {
            return { ok: false, error: 'parentDir trebuie să fie în workspace-ul legat.' };
          }
        } else {
          const win = BrowserWindow.fromWebContents(event.sender);
          const picked = win
            ? await dialog.showOpenDialog(win, {
                title: 'Alege folderul unde se clonează repo-ul',
                properties: ['openDirectory', 'createDirectory'],
              })
            : await dialog.showOpenDialog({
                title: 'Alege folderul unde se clonează repo-ul',
                properties: ['openDirectory', 'createDirectory'],
              });
          if (picked.canceled || !picked.filePaths[0]) {
            return { ok: false, error: 'Clone anulat' };
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
          return { ok: false, error: 'Cale destinație invalidă' };
        }
        if (fsSync.existsSync(resolvedTarget)) {
          return { ok: false, error: `Folderul există deja: ${resolvedTarget}` };
        }

        try {
          await gitExecFile(resolvedParent, ['--version'], { timeoutMs: 15_000 });
        } catch {
          return { ok: false, error: 'Git nu este instalat sau nu e în PATH' };
        }

        const lockKey = bound ?? resolvedParent;
        return await withGitLock(lockKey, async () => {
          await gitExecFile(
            resolvedParent,
            ['clone', '--depth', '1', normalized.cloneUrl, resolvedTarget],
            { timeoutMs: 300_000, maxBuffer: 20 * 1024 * 1024 }
          );
          return { ok: true, path: resolvedTarget };
        });
      } catch (err: unknown) {
        return { ok: false, error: errMessage(err) };
      }
    }
  );
}
