export const WORKSPACE_BOOTSTRAP_MARKER = '<<WORKSPACE_BOOTSTRAP>>';

/** Prepend bootstrap once; skip if marker already present. */
export function mergeProjectContextWithBootstrap(
  existing: string | undefined,
  bootstrap: string
): string {
  if (!bootstrap.trim()) return existing?.trim() ?? '';
  const prior = existing?.trim() ?? '';
  if (prior.includes(WORKSPACE_BOOTSTRAP_MARKER)) return prior;
  if (!prior) return bootstrap;
  return `${bootstrap}\n\n---\n\n${prior}`;
}
