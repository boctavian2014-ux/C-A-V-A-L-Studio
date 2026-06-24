import { ipcMain, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

// ──────────────────────────────────────────────
//  Git IPC Handlers — Caval IDE
//  Toate comenzile git rulează în directorul
//  proiectului activ (projectPath trimis din renderer).
// ──────────────────────────────────────────────

const execAsync = promisify(exec);

// Helper: rulează git într-un director specific
async function git(cwd: string, args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`git ${args}`, {
      cwd,
      maxBuffer: 1024 * 1024 * 10, // 10MB — pentru diff-uri mari
    });
    return stdout;
  } catch (err: any) {
    // git returnează exit code nenul pentru unele comenzi normale (ex: diff fără schimbări)
    return err.stdout || '';
  }
}

// ──────────────────────────────────────────────
//  Tipuri partajate (oglindă cu renderer)
// ──────────────────────────────────────────────

export interface GitFileStatus {
  path: string;          // cale relativă față de repo root
  status: string;        // 'M' = modificat, 'A' = adăugat, 'D' = șters, '?' = untracked, 'R' = redenumit
  staged: boolean;
  oldPath?: string;      // pentru fișiere redenumite (R)
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;          // ISO string
  refs: string;          // branch/tag labels
}

export interface GitStatus {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  isRepo: boolean;
}

// ──────────────────────────────────────────────
//  Parser: git status --porcelain=v1
// ──────────────────────────────────────────────

function parseStatus(raw: string, projectPath: string): GitFileStatus[] {
  const files: GitFileStatus[] = [];
  const lines = raw.split('\n').filter(Boolean);

  for (const line of lines) {
    // Formatul: XY path sau XY oldpath -> newpath
    const xy = line.substring(0, 2);
    const rest = line.substring(3);

    const X = xy[0]; // staged area
    const Y = xy[1]; // working tree

    // Redenumit
    if (X === 'R' || Y === 'R') {
      const parts = rest.split(' -> ');
      files.push({ path: parts[1] || rest, oldPath: parts[0], status: 'R', staged: X === 'R' });
      continue;
    }

    // Untracked
    if (X === '?' && Y === '?') {
      files.push({ path: rest, status: '?', staged: false });
      continue;
    }

    // Staged (index modificat)
    if (X !== ' ' && X !== '?') {
      files.push({ path: rest, status: X, staged: true });
    }

    // Unstaged (working tree modificat)
    if (Y !== ' ' && Y !== '?') {
      // Evităm duplicatele (același fișier apare atât staged cât și unstaged)
      const existing = files.find((f) => f.path === rest && !f.staged);
      if (!existing) {
        files.push({ path: rest, status: Y, staged: false });
      }
    }
  }

  return files;
}

// ──────────────────────────────────────────────
//  Parser: git log
// ──────────────────────────────────────────────

function parseLog(raw: string): GitCommit[] {
  if (!raw.trim()) return [];

  // Separator unic între commits
  const commits = raw.split('\x00').filter(Boolean);

  return commits.map((block) => {
    const parts = block.split('\x1f');
    return {
      hash:      parts[0] || '',
      shortHash: (parts[0] || '').substring(0, 7),
      subject:   parts[1] || '',
      author:    parts[2] || '',
      date:      parts[3] || '',
      refs:      parts[4] || '',
    };
  });
}

// ──────────────────────────────────────────────
//  Registerare handlere IPC
// ──────────────────────────────────────────────

export function registerGitHandlers() {

  // ── git:status ────────────────────────────
  // Returnează branch, ahead/behind, lista fișiere modificate
  ipcMain.handle('git:status', async (_e, projectPath: string): Promise<GitStatus> => {
    try {
      // Verifică dacă e repo git
      await execAsync('git rev-parse --git-dir', { cwd: projectPath });
    } catch {
      return { branch: '', upstream: null, ahead: 0, behind: 0, files: [], isRepo: false };
    }

    // Branch curent
    const branchRaw = await git(projectPath, 'branch --show-current');
    const branch = branchRaw.trim() || 'HEAD detached';

    // Upstream + ahead/behind
    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;

    try {
      const upstreamRaw = await execAsync(
        `git rev-parse --abbrev-ref --symbolic-full-name @{u}`,
        { cwd: projectPath }
      );
      upstream = upstreamRaw.stdout.trim();

      const revListRaw = await execAsync(
        `git rev-list --count --left-right @{u}...HEAD`,
        { cwd: projectPath }
      );
      const [b, a] = revListRaw.stdout.trim().split('\t').map(Number);
      ahead = a || 0;
      behind = b || 0;
    } catch {
      // Nu are upstream setat — ok
    }

    // Fișiere modificate
    const statusRaw = await git(projectPath, 'status --porcelain=v1 -u');
    const files = parseStatus(statusRaw, projectPath);

    return { branch, upstream, ahead, behind, files, isRepo: true };
  });

  // ── git:diff ──────────────────────────────
  // Returnează diff text pentru un fișier specific
  // staged=true → diff față de HEAD (ce e în index)
  // staged=false → diff față de index (working tree)
  ipcMain.handle(
    'git:diff',
    async (_e, projectPath: string, filePath: string, staged: boolean): Promise<string> => {
      const flag = staged ? '--staged' : '';
      const escaped = filePath.replace(/"/g, '\\"');
      const raw = await git(projectPath, `diff ${flag} -- "${escaped}"`);

      // Fișiere untracked — afișăm conținutul întreg ca +
      if (!raw.trim() && !staged) {
        try {
          const abs = path.join(projectPath, filePath);
      const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
          const { stdout } = await execAsync(`git diff --no-index ${nullDevice} "${abs}"`, {
            cwd: projectPath,
          }).catch(() => ({ stdout: '' }));
          return stdout;
        } catch {
          return '';
        }
      }

      return raw;
    }
  );

  // ── git:stage ─────────────────────────────
  // Stage un fișier (git add)
  ipcMain.handle(
    'git:stage',
    async (_e, projectPath: string, filePath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const escaped = filePath.replace(/"/g, '\\"');
        await execAsync(`git add "${escaped}"`, { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }
  );

  // ── git:unstage ───────────────────────────
  // Unstage un fișier (git restore --staged)
  ipcMain.handle(
    'git:unstage',
    async (_e, projectPath: string, filePath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const escaped = filePath.replace(/"/g, '\\"');
        await execAsync(`git restore --staged "${escaped}"`, { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        // Fallback pentru git mai vechi
        try {
          const escaped2 = filePath.replace(/"/g, '\\"');
          await execAsync(`git reset HEAD "${escaped2}"`, { cwd: projectPath });
          return { ok: true };
        } catch (e2: any) {
          return { ok: false, error: e2.message };
        }
      }
    }
  );

  // ── git:stageAll ──────────────────────────
  ipcMain.handle(
    'git:stageAll',
    async (_e, projectPath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await execAsync('git add -A', { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }
  );

  // ── git:unstageAll ────────────────────────
  ipcMain.handle(
    'git:unstageAll',
    async (_e, projectPath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await execAsync('git reset HEAD', { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }
  );

  // ── git:discard ───────────────────────────
  // Discard modificări working tree pentru un fișier
  ipcMain.handle(
    'git:discard',
    async (_e, projectPath: string, filePath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const escaped = filePath.replace(/"/g, '\\"');
        await execAsync(`git restore "${escaped}"`, { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }
  );

  // ── git:commit ────────────────────────────
  ipcMain.handle(
    'git:commit',
    async (_e, projectPath: string, message: string): Promise<{ ok: boolean; error?: string; hash?: string }> => {
      if (!message.trim()) return { ok: false, error: 'Mesajul commit-ului este gol.' };
      try {
        const escaped = message.replace(/"/g, '\\"');
        const { stdout } = await execAsync(`git commit -m "${escaped}"`, { cwd: projectPath });
        // Extrage hash-ul scurt din output
        const match = stdout.match(/\[[\w\s]+ ([a-f0-9]+)\]/);
        return { ok: true, hash: match?.[1] };
      } catch (err: any) {
        return { ok: false, error: err.stderr || err.message };
      }
    }
  );

  // ── git:push ──────────────────────────────
  ipcMain.handle(
    'git:push',
    async (_e, projectPath: string, setUpstream?: boolean): Promise<{ ok: boolean; error?: string }> => {
      try {
        const flag = setUpstream ? '--set-upstream origin HEAD' : '';
        await execAsync(`git push ${flag}`, { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.stderr || err.message };
      }
    }
  );

  // ── git:pull ──────────────────────────────
  ipcMain.handle(
    'git:pull',
    async (_e, projectPath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await execAsync('git pull', { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.stderr || err.message };
      }
    }
  );

  // ── git:log ───────────────────────────────
  // Returnează ultimele N commit-uri
  ipcMain.handle(
    'git:log',
    async (_e, projectPath: string, limit = 50): Promise<GitCommit[]> => {
      const format = '%H%x1f%s%x1f%an%x1f%aI%x1f%D%x00';
      const raw = await git(projectPath, `log --format="${format}" -n ${limit}`);
      return parseLog(raw);
    }
  );

  // ── git:branches ──────────────────────────
  // Lista de branch-uri locale
  ipcMain.handle(
    'git:branches',
    async (_e, projectPath: string): Promise<string[]> => {
      const raw = await git(projectPath, 'branch --format=%(refname:short)');
      return raw.split('\n').map((b) => b.trim()).filter(Boolean);
    }
  );

  // ── git:checkout ──────────────────────────
  ipcMain.handle(
    'git:checkout',
    async (_e, projectPath: string, branch: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const escaped = branch.replace(/"/g, '\\"');
        await execAsync(`git checkout "${escaped}"`, { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.stderr || err.message };
      }
    }
  );

  // ── git:createBranch ──────────────────────
  ipcMain.handle(
    'git:createBranch',
    async (_e, projectPath: string, name: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const escaped = name.replace(/"/g, '\\"');
        await execAsync(`git checkout -b "${escaped}"`, { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.stderr || err.message };
      }
    }
  );

  // ── git:stash ─────────────────────────────
  ipcMain.handle(
    'git:stash',
    async (_e, projectPath: string, message?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const cmd = message ? `git stash push -m "${message}"` : 'git stash';
        await execAsync(cmd, { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.stderr || err.message };
      }
    }
  );

  // ── git:stashPop ──────────────────────────
  ipcMain.handle(
    'git:stashPop',
    async (_e, projectPath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await execAsync('git stash pop', { cwd: projectPath });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.stderr || err.message };
      }
    }
  );
}
