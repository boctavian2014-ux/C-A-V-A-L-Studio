/**
 * Auto-repair continuation for Build mode after consistency scan failures.
 */
import type { ConsistencyScanResult } from '../composer/consistency-engine';

export const BUILD_CONTINUE_MARKER = 'BUILD_CONTINUE';

export const BUILD_CONTINUE_USER_MESSAGE = [
  BUILD_CONTINUE_MARKER,
  '',
  'Consistency scan failed. Fix all reported issues automatically.',
  '',
  'Emit corrected files as complete ```lang:relative/path``` blocks with full source.',
  'Do not repeat explanations — fix and save only.',
].join('\n');

export function isBuildContinueRequest(message: string): boolean {
  return new RegExp(`\\b${BUILD_CONTINUE_MARKER}\\b`, 'i').test(message);
}

function formatDiagnostics(scan: ConsistencyScanResult): string {
  const lines: string[] = [];

  for (const d of scan.syntax) {
    lines.push(`[syntax] ${d.file ?? '?'}: ${d.message}`);
  }
  for (const i of scan.importIssues) {
    lines.push(`[import] ${i.file}: ${i.importPath} — ${i.message}`);
  }
  if (scan.verify?.commands) {
    for (const c of scan.verify.commands.filter((x) => !x.ok)) {
      lines.push(`[verify] ${c.command}:\n${c.output.slice(0, 800)}`);
    }
  }
  if (lines.length === 0) {
    lines.push(scan.summary);
  }
  return lines.join('\n');
}

export function buildScaffoldContinueMessage(scan: ConsistencyScanResult): string {
  const diagnostics = formatDiagnostics(scan).slice(0, 4_000);
  return [BUILD_CONTINUE_USER_MESSAGE, '', '--- Diagnostics ---', diagnostics].join('\n');
}
