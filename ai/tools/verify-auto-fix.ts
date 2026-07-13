import fs from 'node:fs';
import path from 'node:path';

import { runAllowedWorkspaceCommand, type CommandRunResult } from './workspace-command-runner';

const MISSING_MODULE_PATTERNS = [
  /Cannot find module ['"]([^'"]+)['"]/gi,
  /Cannot find module ['"]([^'"]+)['"] or its corresponding type declarations/gi,
  /TS2307:\s*Cannot find module ['"]([^'"]+)['"]/gi,
  /Module not found:\s*Error:\s*Can't resolve ['"]([^'"]+)['"]/gi,
];

const RELATIVE_MODULE_PATTERNS = [
  /TS2307:\s*Cannot find module ['"](\.\.?\/[^'"]+)['"]/gi,
  /Cannot find module ['"](\.\.?\/[^'"]+)['"] or its corresponding type declarations/gi,
];

/** Scoped/bare package names from import paths (skip relative paths). */
export function extractMissingModules(verifyOutput: string): string[] {
  const found = new Set<string>();
  for (const pattern of MISSING_MODULE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(verifyOutput)) !== null) {
      const raw = match[1]?.trim();
      if (!raw || raw.startsWith('.') || raw.startsWith('/')) continue;
      const pkg = raw.startsWith('@')
        ? raw.split('/').slice(0, 2).join('/')
        : raw.split('/')[0];
      if (pkg && /^[@\w][\w@./-]*$/.test(pkg)) {
        found.add(pkg);
      }
    }
  }
  return [...found];
}

export interface RelativeModuleError {
  file?: string;
  modulePath: string;
}

/** Parse TS2307 errors for relative import paths (./ or ../). */
export function extractRelativeModuleErrors(verifyOutput: string): RelativeModuleError[] {
  const found: RelativeModuleError[] = [];
  const seen = new Set<string>();
  const lines = verifyOutput.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fileMatch = /^(.+?)\(\d+,\d+\):\s*error\s+TS2307:/.exec(line);
    const currentFile = fileMatch?.[1]?.replace(/\\/g, '/');
    for (const pattern of RELATIVE_MODULE_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        const modulePath = match[1]?.trim();
        if (!modulePath || !modulePath.startsWith('.')) continue;
        const key = `${currentFile ?? '?'}:${modulePath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ file: currentFile, modulePath });
      }
    }
  }
  // Also scan full output for module paths without file context
  for (const pattern of RELATIVE_MODULE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(verifyOutput)) !== null) {
      const modulePath = match[1]?.trim();
      if (!modulePath || !modulePath.startsWith('.')) continue;
      if ([...seen].some((k) => k.endsWith(`:${modulePath}`))) continue;
      const key = `?:${modulePath}`;
      seen.add(key);
      found.push({ modulePath });
    }
  }
  return found;
}

/** Apply programmatic fashion-web fixes (duplicate removal + import path repair). */
export async function applyFashionWebImportFixes(
  workspaceRoot: string,
  verifyOutput?: string
): Promise<AutoFixBeforeVerifyResult> {
  const relativeErrors = verifyOutput ? extractRelativeModuleErrors(verifyOutput) : [];
  const hasRelativeIssues = relativeErrors.length > 0;
  const { consolidateFashionWebWorkspace } = await import('../scaffolds/workspace-cleanup.js');
  const result = consolidateFashionWebWorkspace(workspaceRoot);
  const changed =
    result.deleted.length + result.fixed.length + result.created.length > 0 || hasRelativeIssues;
  if (!changed) {
    return { installed: false, ok: true, output: '' };
  }
  const parts = [
    result.deleted.length ? `deleted ${result.deleted.length}` : '',
    result.fixed.length ? `fixed imports ${result.fixed.length}` : '',
    result.created.length ? `created ${result.created.length}` : '',
  ].filter(Boolean);
  return {
    installed: false,
    ok: true,
    output: `fashion-web consolidate: ${parts.join(', ') || 'scanned'}`,
  };
}

function nodeModulesExists(workspaceRoot: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, 'node_modules'));
}

function packageJsonExists(workspaceRoot: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, 'package.json'));
}

/** Install specific packages or run bare npm install in workspace. */
export async function ensureWorkspaceDependencies(
  workspaceRoot: string,
  modules: string[] = []
): Promise<CommandRunResult> {
  const unique = [...new Set(modules.filter(Boolean))];
  const command = unique.length > 0 ? `npm install ${unique.join(' ')}` : 'npm install';
  return runAllowedWorkspaceCommand(command, workspaceRoot, 180_000);
}

export interface AutoFixBeforeVerifyOptions {
  writtenFiles?: string[];
  autoInstall?: boolean;
}

export interface AutoFixBeforeVerifyResult {
  installed: boolean;
  command?: string;
  ok: boolean;
  output: string;
}

/**
 * Run npm install when package.json exists and node_modules is missing
 * or package.json was written in the current wave.
 */
export async function maybeAutoFixBeforeVerify(
  workspaceRoot: string,
  options: AutoFixBeforeVerifyOptions = {}
): Promise<AutoFixBeforeVerifyResult> {
  if (!options.autoInstall) {
    return { installed: false, ok: true, output: '' };
  }
  if (!packageJsonExists(workspaceRoot)) {
    return { installed: false, ok: true, output: '' };
  }

  const pkgWritten = (options.writtenFiles ?? []).some((f) => /package\.json$/i.test(f));
  const needsInstall = pkgWritten || !nodeModulesExists(workspaceRoot);
  if (!needsInstall) {
    return { installed: false, ok: true, output: '' };
  }

  const result = await ensureWorkspaceDependencies(workspaceRoot);
  return {
    installed: true,
    command: result.command,
    ok: result.ok,
    output: result.output,
  };
}

/** Parse verify failure output and install missing npm packages, then return install result. */
export async function autoFixMissingModulesFromVerify(
  workspaceRoot: string,
  verifyOutput: string
): Promise<AutoFixBeforeVerifyResult> {
  const modules = extractMissingModules(verifyOutput);
  if (modules.length === 0) {
    return { installed: false, ok: true, output: '' };
  }
  const result = await ensureWorkspaceDependencies(workspaceRoot, modules);
  return {
    installed: true,
    command: result.command,
    ok: result.ok,
    output: result.output,
  };
}
