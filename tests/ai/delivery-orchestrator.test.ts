import { describe, expect, it } from 'vitest';
import {
  canAutoContinueDelivery,
  isDeliveryBlocked,
  isDeliveryIncomplete,
  DEFAULT_FULL_DELIVERY,
} from '../../ai/composer/delivery-orchestrator';
import type { CompletionGateResult } from '../../ai/composer/project-completion-gate';

describe('delivery-orchestrator', () => {
  it('isDeliveryIncomplete when no files written', () => {
    expect(isDeliveryIncomplete({ writtenFiles: [], taskCount: 3 })).toBe(true);
  });

  it('isDeliveryIncomplete when recap mentions missing', () => {
    expect(
      isDeliveryIncomplete({
        writtenFiles: ['a.ts'],
        recap: 'missing tests and README',
        taskCount: 4,
      })
    ).toBe(true);
  });

  it('isDeliveryIncomplete when too few files vs tasks', () => {
    expect(
      isDeliveryIncomplete({
        writtenFiles: ['only.ts'],
        taskCount: 5,
      })
    ).toBe(true);
  });

  it('canAutoContinueDelivery respects wave limit', () => {
    expect(canAutoContinueDelivery(0, DEFAULT_FULL_DELIVERY)).toBe(true);
    expect(canAutoContinueDelivery(2, DEFAULT_FULL_DELIVERY)).toBe(true);
    expect(canAutoContinueDelivery(3, DEFAULT_FULL_DELIVERY)).toBe(false);
  });

  it('isDeliveryBlocked when completion gate fails', () => {
    const gate: CompletionGateResult = {
      ok: false,
      issues: [{ code: 'verify_failed', message: 'build failed' }],
      suggestedContinueMessage: 'DELIVERY_CONTINUE\nfix build',
    };
    expect(
      isDeliveryBlocked({ writtenFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts'], taskCount: 2 }, gate)
    ).toBe(true);
  });
});
