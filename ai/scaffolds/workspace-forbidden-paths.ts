/** Paths and packages that must never appear in user workspaces (Cavallo IDE internals). */

export const FORBIDDEN_USER_WORKSPACE_PATH_RE =
  /^(src\/zero-latency\/|ai\/composer\/zero-latency\/|zero-latency-composer\/|cavallo_task_generator\/)/i;

export const FORBIDDEN_USER_PACKAGE_NAMES = new Set([
  'zero-latency-composer',
  'zero_latency_composer',
  'caval-studio',
  'caval_studio',
]);

export const FORBIDDEN_TASK_PATTERNS: RegExp[] = [
  /\bzero[- ]?latency\b/i,
  /\bcavallo_task_generator\b/i,
  /\bzero-latency-composer\b/i,
  /src\/zero-latency\//i,
];

export function normalizeWorkspacePath(raw: string): string {
  return raw.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
}

export function isForbiddenUserWorkspacePath(filePath: string): boolean {
  const normalized = normalizeWorkspacePath(filePath);
  return FORBIDDEN_USER_WORKSPACE_PATH_RE.test(normalized);
}

export function isForbiddenTaskDescription(description: string): boolean {
  return FORBIDDEN_TASK_PATTERNS.some((re) => re.test(description));
}

export interface ForbiddenTaskFilterResult<T extends { description: string }> {
  kept: T[];
  removed: T[];
}

/** Drop or rewrite tasks that reference Cavallo-internal modules in user projects. */
export function filterForbiddenTasks<T extends { id: string; description: string; module: string }>(
  tasks: T[]
): ForbiddenTaskFilterResult<T> {
  const kept: T[] = [];
  const removed: T[] = [];

  for (const task of tasks) {
    if (isForbiddenTaskDescription(task.description)) {
      removed.push(task);
      continue;
    }
    kept.push(task);
  }

  return { kept, removed };
}

export function findForbiddenPathsInFileList(files: string[]): string[] {
  return files.filter(isForbiddenUserWorkspacePath);
}
