import { describe, expect, it } from 'vitest';

import {
  CAVALLO_MODES_TEST_FIXTURE,
  CAVALLO_MODES_TEST_ROBOTICS_FIXTURE,
  getModeEndLabel,
  isCavalloModesTestRequest,
} from '../../ai/prompts/cavallo-mode-protocol';

describe('cavallo-mode-protocol', () => {
  it('detects Test Cavallo modes trigger', () => {
    expect(isCavalloModesTestRequest('Test Cavallo modes')).toBe(true);
    expect(isCavalloModesTestRequest('testează modurile cavallo')).toBe(true);
    expect(isCavalloModesTestRequest('hello world')).toBe(false);
  });

  it('maps mode end labels', () => {
    expect(getModeEndLabel('plan')).toBe('[END PLAN]');
    expect(getModeEndLabel('robotics')).toBe('[END ROBOTICS]');
  });

  it('fixture contains all five end labels', () => {
    expect(CAVALLO_MODES_TEST_FIXTURE).toContain('[END PLAN]');
    expect(CAVALLO_MODES_TEST_FIXTURE).toContain('[END CODE]');
    expect(CAVALLO_MODES_TEST_FIXTURE).toContain('[END ASK]');
    expect(CAVALLO_MODES_TEST_FIXTURE).toContain('[END DEBUG]');
    expect(CAVALLO_MODES_TEST_FIXTURE).toContain('[END ROBOTICS]');
  });

  it('robotics fixture ends with [END ROBOTICS]', () => {
    expect(CAVALLO_MODES_TEST_ROBOTICS_FIXTURE.trim().endsWith('[END ROBOTICS]')).toBe(true);
  });
});
