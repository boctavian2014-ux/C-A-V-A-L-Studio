import type { ConsistencyScanResult } from '../composer/consistency-engine';

export const ARENA_CONTINUE_MARKER = 'ARENA_CONTINUE';

export const ARENA_CONTINUE_USER_MESSAGE = [
  ARENA_CONTINUE_MARKER,
  '',
  'Arena consistency scan failed. Fix all reported issues automatically.',
  '',
  'Emit corrected files as complete ```lang:relative/path``` blocks with full source.',
].join('\n');

export function isArenaContinueRequest(message: string): boolean {
  return new RegExp(`\\b${ARENA_CONTINUE_MARKER}\\b`, 'i').test(message);
}

export function buildArenaContinueMessage(scan: ConsistencyScanResult): string {
  const lines: string[] = [];
  for (const d of scan.syntax) lines.push(`[syntax] ${d.file ?? '?'}: ${d.message}`);
  for (const i of scan.importIssues) lines.push(`[import] ${i.file}: ${i.importPath}`);
  const failed = scan.verify?.commands?.find((c) => !c.ok);
  if (failed) lines.push(`[verify] ${failed.command}: ${failed.output.slice(0, 600)}`);
  const diagnostics = (lines.length ? lines.join('\n') : scan.summary).slice(0, 4000);
  return [ARENA_CONTINUE_USER_MESSAGE, '', '--- Diagnostics ---', diagnostics].join('\n');
}
