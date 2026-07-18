import { describe, expect, it } from 'vitest';

import {
  formatSelfAuditBadge,
  parseSelfAuditOutput,
} from '../../ai/composer/multi-agent/self-audit-parser';

describe('self-audit-parser', () => {
  it('parses markdown Self-Audit section and JSON scores', () => {
    const raw = `
Some implementation output here.

## Self-Audit (max 8 lines)
- TaskSuccess: pass
- ToolUseAccuracy: 82
- TrajectoryEfficiency: 71
- TopFailureMode: wrong import path

\`\`\`json
{"reasoning":85,"coding":72,"planning":90,"toolUse":63,"failureModes":["wrong tool params"]}
\`\`\`
`;
    const parsed = parseSelfAuditOutput(raw);
    expect(parsed?.taskSuccess).toBe('pass');
    expect(parsed?.toolUseAccuracy).toBe(82);
    expect(parsed?.trajectoryEfficiency).toBe(71);
    expect(parsed?.topFailureMode).toBe('wrong import path');
    expect(parsed?.scores?.reasoning).toBe(85);
    expect(parsed?.scores?.coding).toBe(72);
    expect(parsed?.scores?.failureModes).toContain('wrong tool params');
  });

  it('returns null when Self-Audit header is missing', () => {
    expect(parseSelfAuditOutput('plain output')).toBeNull();
  });

  it('formats timeline badge', () => {
    const badge = formatSelfAuditBadge({
      taskSuccess: 'pass',
      toolUseAccuracy: 78,
      trajectoryEfficiency: 94,
    });
    expect(badge).toBe('TS:✓ · TU:78% · TR:94%');
  });
});
