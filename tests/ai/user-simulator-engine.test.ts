import { describe, expect, it } from 'vitest';
import { hasFixableUserSimIssues } from '../../ai/composer/user-simulator-engine';

describe('user-simulator-engine helpers', () => {
  it('hasFixableUserSimIssues true for critical/major', () => {
    expect(
      hasFixableUserSimIssues([{ severity: 'minor', source: 'x', message: 'a' }])
    ).toBe(false);
    expect(
      hasFixableUserSimIssues([{ severity: 'major', source: 'x', message: 'a' }])
    ).toBe(true);
    expect(
      hasFixableUserSimIssues([{ severity: 'critical', source: 'x', message: 'a' }])
    ).toBe(true);
  });
});
