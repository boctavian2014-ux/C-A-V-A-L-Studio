import { describe, expect, it } from 'vitest';
import {
  SCAFFOLD_CONTINUE_MARKER,
  SCAFFOLD_EMISSION_RULE,
  buildScaffoldContinueUserMessage,
  isScaffoldContinueRequest,
} from '../../ai/prompts/scaffold-emission-rule';

describe('scaffold-emission-rule', () => {
  it('defines emission rule with lang:path requirement', () => {
    expect(SCAFFOLD_EMISSION_RULE).toContain('lang:relative/path');
    expect(SCAFFOLD_EMISSION_RULE).toContain('parseScaffoldFiles');
    expect(SCAFFOLD_EMISSION_RULE).toMatch(/AUTO FILE TREE/i);
    expect(SCAFFOLD_EMISSION_RULE).toContain('package.json');
    expect(SCAFFOLD_EMISSION_RULE).toContain('folderul DESCHIS');
    expect(SCAFFOLD_EMISSION_RULE).toMatch(/NU trebuie să spună/);
    expect(SCAFFOLD_EMISSION_RULE).not.toMatch(/nu prin finish/i);
  });

  it('buildScaffoldContinueUserMessage includes marker and plan ref', () => {
    const msg = buildScaffoldContinueUserMessage('Goal: ship API');
    expect(msg).toContain(SCAFFOLD_CONTINUE_MARKER);
    expect(msg).toContain('Goal: ship API');
  });

  it('isScaffoldContinueRequest detects marker', () => {
    expect(isScaffoldContinueRequest('SCAFFOLD_CONTINUE please emit files')).toBe(true);
    expect(isScaffoldContinueRequest('continuă scaffold')).toBe(false);
  });
});
