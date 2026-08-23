import fs from 'node:fs';
import path from 'node:path';

import { detectVerifyCommands, runWorkspaceVerify } from '../tools/workspace-verify';
import type { WorkspaceDiscoverySnapshot } from '../../src/shared/workspace-discovery-contract';
import { gitService } from '../../src/main/git/git-service';
import {
  DISCOVERY_IGNORE_DIRS,
  DISCOVERY_SKIP_FILES,
  detectLockfile,
  inferProjectType,
  parsePackageScripts,
  recommendNextStep,
  scanTodoMarkers,
} from './workspace-discovery';

const KEY_DIRS = ['src', 'tests', 'test', 'app', 'packages', 'ai', 'components'] as const;
const MAX_TODO_FILES = 12;

function listRootEntries(workspaceRoot: string): string[] {
  try {
    return fs
      .readdirSync(workspaceRoot, { withFileTypes: true })
      .filter((entry) => !DISCOVERY_IGNORE_DIRS.has(entry.name) && !DISCOVERY_SKIP_FILES.has(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
  } catch {
    return [];
  }
}

function detectKeyDirs(workspaceRoot: string, rootEntries: string[]): string[] {
  return KEY_DIRS.filter((dir) => {
    if (rootEntries.includes(`${dir}/`)) return true;
    try {
      return fs.statSync(path.join(workspaceRoot, dir)).isDirectory();
    } catch {
      return false;
    }
  });
}

function readPackageMeta(workspaceRoot: string): {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
} | null {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  try {
    if (!fs.existsSync(pkgPath)) return null;
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

function scanTodosInFiles(workspaceRoot: string, relativeFiles: string[]): WorkspaceDiscoverySnapshot['todos'] {
  const todos: WorkspaceDiscoverySnapshot['todos'] = [];
  for (const rel of relativeFiles.slice(0, MAX_TODO_FILES)) {
    if (DISCOVERY_SKIP_FILES.has(path.basename(rel))) continue;
    const full = path.join(workspaceRoot, rel);
    try {
      if (!fs.statSync(full).isFile()) continue;
      if (fs.statSync(full).size > 256 * 1024) continue;
      const content = fs.readFileSync(full, 'utf8');
      for (const hit of scanTodoMarkers(content, 2)) {
        todos.push({ file: rel.replace(/\\/g, '/'), ...hit });
        if (todos.length >= 8) return todos;
      }
    } catch {
      /* unreadable */
    }
  }
  return todos;
}

/** Read-only workspace inspection — main process only, caller must pass validated bound root. */
export async function inspectWorkspaceDiscovery(
  workspaceRoot: string,
  options: { runVerify?: boolean } = {}
): Promise<WorkspaceDiscoverySnapshot> {
  const root = workspaceRoot.trim();
  const projectName = path.basename(root) || 'workspace';
  const rootEntries = listRootEntries(root);
  const keyDirs = detectKeyDirs(root, rootEntries);
  const pkg = readPackageMeta(root);
  const scripts = parsePackageScripts(pkg);
  const lockfile = detectLockfile(rootEntries.map((e) => e.replace(/\/$/, '')));
  const hasReadme = rootEntries.some((e) => /^readme/i.test(e.replace(/\/$/, '')));

  let git: WorkspaceDiscoverySnapshot['git'];
  try {
    const status = await gitService.status(root);
    const modifiedFiles = status.files
      .map((f) => f.path.replace(/\\/g, '/'))
      .filter((p) => !DISCOVERY_SKIP_FILES.has(path.basename(p)))
      .slice(0, 20);
    let lastCommit: string | undefined;
    if (status.isRepo) {
      const log = await gitService.log(root, 1);
      const entry = log[0];
      if (entry) {
        lastCommit = `${entry.shortHash} ${entry.message.slice(0, 120)}`;
      }
    }
    git = {
      isRepo: status.isRepo,
      branch: status.branch || undefined,
      modifiedCount: status.files.length,
      modifiedFiles,
      lastCommit,
    };
  } catch {
    git = { isRepo: false, modifiedCount: 0, modifiedFiles: [] };
  }

  const todoTargets =
    git.modifiedFiles.length > 0
      ? git.modifiedFiles
      : keyDirs.flatMap((dir) => {
          const dirPath = path.join(root, dir);
          try {
            return fs
              .readdirSync(dirPath, { withFileTypes: true })
              .filter((e) => e.isFile() && /\.(tsx?|jsx?|md)$/i.test(e.name))
              .slice(0, 4)
              .map((e) => path.join(dir, e.name).replace(/\\/g, '/'));
          } catch {
            return [];
          }
        });

  const todos = scanTodosInFiles(root, todoTargets);

  let verify: WorkspaceDiscoverySnapshot['verify'];
  if (options.runVerify !== false && pkg) {
    const planned = detectVerifyCommands(root);
    if (planned.length > 0) {
      const result = await runWorkspaceVerify(root, { autoInstall: false });
      verify = {
        ran: result.ran,
        summary: result.summary,
        allOk: result.ran ? result.commands.every((c) => c.ok) : undefined,
      };
    } else {
      verify = { ran: false, summary: 'no verify scripts (typecheck/build/test) in package.json' };
    }
  }

  const snapshot: WorkspaceDiscoverySnapshot = {
    ok: true,
    projectName,
    projectType: inferProjectType({
      scripts,
      rootEntries: rootEntries.map((e) => e.replace(/\/$/, '')),
      keyDirs,
      packageName: pkg?.name,
      dependencies: pkg?.dependencies,
    }),
    packageManager: lockfile,
    hasPackageJson: Boolean(pkg),
    hasReadme,
    rootEntries: rootEntries.slice(0, 40),
    keyDirs,
    scripts,
    lockfile,
    git,
    todos,
    verify,
    recommendedNextStep: '',
  };
  snapshot.recommendedNextStep = recommendNextStep(snapshot);
  return snapshot;
}
