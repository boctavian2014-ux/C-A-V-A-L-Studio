/**
 * Unified autonomous repair continuation for Agentic mode.
 */
import type { ConsistencyScanResult } from '../composer/consistency-engine';
import type { CompletionGateResult } from '../composer/completion-gate-types';
import {
  FASHION_DUPLICATE_RULE,
  FASHION_TYPESCRIPT_RULE,
  USER_WORKSPACE_FORBIDDEN_RULE,
} from '../scaffolds/workspace-rules';

export const AGENTIC_REPAIR_MARKER = 'AGENTIC_REPAIR';

export const AGENTIC_REPAIR_USER_MESSAGE = [
  AGENTIC_REPAIR_MARKER,
  '',
  'Autonomous repair wave: proiectul NU e ready-to-use. Rezolvă TOATE issue-urile automat.',
  '',
  'Emite fence-uri complete ```lang:relative/path``` cu sursă COMPLETĂ.',
  'Adaugă dependențele lipsă în package.json când verify raportează module negăsite.',
  'Nu cere userului DELIVERY_CONTINUE sau SCAFFOLD_CONTINUE — fix și salvează.',
  '',
  'FORBIDDEN_PATH: șterge din output orice referință la src/zero-latency/ sau cavallo_task_generator/ — nu le re-crea.',
  'VERIFY_FAILED / TS2307: folosește web/src/types.ts + api/matching.ts existente; NU crea types/index.ts sau web/src/api.ts.',
  '',
  USER_WORKSPACE_FORBIDDEN_RULE,
  '',
  FASHION_TYPESCRIPT_RULE,
  '',
  FASHION_DUPLICATE_RULE,
].join('\n');

export function isAgenticRepairRequest(message: string): boolean {
  return new RegExp(`\\b${AGENTIC_REPAIR_MARKER}\\b`, 'i').test(message);
}

export interface AgenticRepairMessageInput {
  wave: number;
  gate?: CompletionGateResult;
  consistencyScan?: ConsistencyScanResult;
  verifyOutput?: string;
  planContext?: string;
}

function formatConsistencyDiagnostics(scan: ConsistencyScanResult): string {
  const lines: string[] = [];
  for (const d of scan.syntax) {
    lines.push(`[syntax] ${d.file ?? '?'}: ${d.message}`);
  }
  for (const i of scan.importIssues) {
    lines.push(`[import] ${i.file}: ${i.importPath} — ${i.message}`);
  }
  const failed = scan.verify?.commands?.find((c) => !c.ok);
  if (failed) {
    lines.push(`[verify] ${failed.command}:\n${failed.output.slice(0, 800)}`);
  }
  if (lines.length === 0) {
    lines.push(scan.summary);
  }
  return lines.join('\n');
}

export function buildAgenticRepairMessage(input: AgenticRepairMessageInput): string {
  const sections: string[] = [
    AGENTIC_REPAIR_USER_MESSAGE,
    '',
    `--- Repair wave ${input.wave + 1} ---`,
  ];

  if (input.gate && !input.gate.ok && input.gate.issues.length > 0) {
    sections.push('', '--- Gate issues ---');
    for (const issue of input.gate.issues.slice(0, 12)) {
      sections.push(`- [${issue.code}] ${issue.message}`);
    }
    const suggested = input.gate.suggestedContinueMessage?.trim();
    if (suggested) {
      sections.push('', suggested.slice(0, 2_000));
    }
  }

  if (input.consistencyScan && !input.consistencyScan.ok) {
    sections.push('', '--- Consistency ---', formatConsistencyDiagnostics(input.consistencyScan).slice(0, 2_000));
  }

  if (input.verifyOutput?.trim()) {
    sections.push('', '--- Verify output ---', input.verifyOutput.trim().slice(0, 2_000));
  }

  const ref = input.planContext?.trim().slice(0, 2_000);
  if (ref) {
    sections.push('', '--- Plan / context ---', ref);
  }

  return sections.join('\n');
}
