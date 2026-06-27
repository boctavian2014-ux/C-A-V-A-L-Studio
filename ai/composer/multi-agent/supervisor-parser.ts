import type { SupervisorResult } from './types';

export function parseSupervisorOutput(raw: string): SupervisorResult {
  const finalLine = raw.match(
    /\*\*Final Approval or Rejection:\*\*\s*(APPROVED|REJECTED)/i
  );
  const tailMatch = raw.trim().match(/(?:^|\n)\s*(APPROVED|REJECTED)\s*$/im);
  const decision = (finalLine?.[1] ?? tailMatch?.[1])?.toUpperCase();
  const finalApproved = decision === 'APPROVED' || (decision !== 'REJECTED' && !/\bREJECTED\b/i.test(raw));

  const issues: SupervisorResult['issues'] = [];
  const issueSection = raw.match(/\*\*Issue List[^*]*\*\*\s*([\s\S]*?)(?=\*\*Fix|\*\*Final|$)/i)?.[1] ?? '';

  for (const line of issueSection.split('\n')) {
    const trimmed = line.replace(/^[-*•]\s*/, '').trim();
    if (!trimmed) continue;
    const sevMatch = trimmed.match(/^(critical|major|minor)\s*[:\-–]\s*(.+)$/i);
    if (sevMatch) {
      issues.push({
        severity: sevMatch[1]!.toLowerCase() as 'critical' | 'major' | 'minor',
        message: sevMatch[2]!.trim(),
      });
      continue;
    }
    if (/critical|major|minor/i.test(trimmed)) {
      const severity = (trimmed.match(/critical|major|minor/i)?.[0]?.toLowerCase() ?? 'minor') as
        | 'critical'
        | 'major'
        | 'minor';
      issues.push({ severity, message: trimmed });
    }
  }

  const summaryMatch = raw.match(/\*\*Supervisor Review Summary\*\*\s*([^\n]+)/i);
  return {
    approved: finalApproved && decision !== 'REJECTED',
    raw,
    issues,
    summary: summaryMatch?.[1]?.trim() ?? (finalApproved ? 'Approved' : 'Rejected'),
  };
}
