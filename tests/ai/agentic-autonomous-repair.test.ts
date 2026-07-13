import { describe, expect, it } from 'vitest';

import { canAutoContinueRepair } from '../../ai/composer/delivery-orchestrator';
import { DEFAULT_FULL_DELIVERY_CONFIG } from '../../ai/composer/multi-agent/types';
import {
  buildAgenticRepairMessage,
  isAgenticRepairRequest,
} from '../../ai/prompts/agentic-repair';
import { evaluateCompletionGate } from '../../ai/composer/project-completion-gate';

describe('agentic autonomous repair', () => {
  it('canAutoContinueRepair respects autonomousFinish and maxRepairWaves', () => {
    const cfg = { ...DEFAULT_FULL_DELIVERY_CONFIG, autonomousFinish: true, maxRepairWaves: 3 };
    expect(canAutoContinueRepair(0, cfg)).toBe(true);
    expect(canAutoContinueRepair(2, cfg)).toBe(true);
    expect(canAutoContinueRepair(3, cfg)).toBe(false);
    expect(canAutoContinueRepair(0, { ...cfg, autonomousFinish: false })).toBe(false);
  });

  it('buildAgenticRepairMessage includes gate issues and verify output', () => {
    const gate = evaluateCompletionGate({
      workspaceRoot: process.cwd(),
      writtenFiles: ['src/index.ts'],
      userMessage: 'app',
      taskCount: 1,
      supervisorApproved: false,
    });
    const msg = buildAgenticRepairMessage({
      wave: 0,
      gate,
      verifyOutput: 'npm run typecheck\nCannot find module lucide-react',
    });
    expect(msg).toContain('AGENTIC_REPAIR');
    expect(msg).toContain('supervisor_rejected');
    expect(msg).toContain('lucide-react');
  });

  it('detects AGENTIC_REPAIR marker', () => {
    expect(isAgenticRepairRequest('AGENTIC_REPAIR fix verify')).toBe(true);
    expect(isAgenticRepairRequest('hello')).toBe(false);
  });
});

describe('agentic completion gate verify_required', () => {
  it('suggestedContinueMessage is non-empty when verify required', () => {
    const result = evaluateCompletionGate({
      workspaceRoot: process.cwd(),
      writtenFiles: ['package.json', 'src/index.ts'],
      userMessage: 'dashboard',
      taskCount: 2,
      consistencyOk: true,
      supervisorApproved: true,
    });
    if (!result.ok && result.issues.some((i) => i.code === 'verify_required')) {
      expect(result.suggestedContinueMessage.length).toBeGreaterThan(0);
      expect(result.suggestedContinueMessage).toContain('DELIVERY_CONTINUE');
    }
  });
});
