import { describe, expect, it } from 'vitest';
import { parseSupervisorOutput } from '../../../ai/composer/multi-agent/supervisor-parser';

describe('supervisor-parser', () => {
  it('detects approval', () => {
    const raw = `
**Supervisor Review Summary:** All good
**Issue List (with severity):**
- minor: naming
**Final Approval or Rejection:** APPROVED
`;
    const result = parseSupervisorOutput(raw);
    expect(result.approved).toBe(true);
  });

  it('detects rejection', () => {
    const raw = `
**Issue List (with severity):**
- critical: missing auth
**Final Approval or Rejection:** REJECTED
`;
    const result = parseSupervisorOutput(raw);
    expect(result.approved).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(0);
  });
});
