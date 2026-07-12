import type { SupervisorResult, SupervisorIssue } from './types';
import type { CompletionGateResult } from '../project-completion-gate';

function toSupervisorIssues(gate: CompletionGateResult): SupervisorIssue[] {
  return gate.issues.map((i) => ({
    severity:
      i.code === 'junk_workspace' || i.code === 'verify_failed' ? ('critical' as const) : ('major' as const),
    message: i.message,
    fix: i.code,
  }));
}

/** Fast-path supervisor: programmatic approval only when completion gate passes. */
export function runProgrammaticSupervisor(gate: CompletionGateResult): SupervisorResult {
  if (gate.ok) {
    return {
      approved: true,
      raw: 'PROGRAMMATIC_GATE',
      issues: [],
      summary: 'completion gates passed',
    };
  }

  const issueLines = gate.issues.map((i) => `- ${i.code}: ${i.message}`);
  return {
    approved: false,
    raw: ['PROGRAMMATIC_GATE_BLOCKED', '', ...issueLines].join('\n'),
    issues: toSupervisorIssues(gate),
    summary: `blocked: ${gate.issues[0]?.code ?? 'gate'} (${gate.issues.length} issue(s))`,
  };
}

/** Pending supervisor placeholder before compose/gate (fast pipeline). */
export function pendingFastPipelineSupervisor(): SupervisorResult {
  return {
    approved: false,
    raw: 'FAST_PIPELINE_PENDING',
    issues: [],
    summary: 'awaiting completion gate',
  };
}
