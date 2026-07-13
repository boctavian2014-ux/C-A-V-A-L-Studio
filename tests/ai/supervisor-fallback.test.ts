import { describe, expect, it } from 'vitest';

import { resolveDeliveryOutcome } from '../../ai/composer/multi-agent/delivery-status';
import { evaluateCompletionGate } from '../../ai/composer/project-completion-gate';

const baseGateInput = {
  workspaceRoot: process.cwd(),
  writtenFiles: [
    'src/index.ts',
    'src/app.tsx',
    'package.json',
    'README.md',
    'tests/app.test.ts',
    'vite.config.ts',
  ],
  userMessage: 'build app',
  taskCount: 3,
  consistencyOk: true,
};

describe('supervisorFallback delivery', () => {
  const verifyOk = {
    ran: true,
    commands: [{ command: 'npm test', ok: true, exitCode: 0, output: '' }],
    summary: 'npm test: ok',
  };

  it('allows delivery with needsReview when supervisor rejected and fallback on', () => {
    const gate = evaluateCompletionGate({
      ...baseGateInput,
      supervisorApproved: false,
      supervisorRaw: 'REJECTED',
      supervisorFallback: true,
      verify: verifyOk,
    });
    expect(gate.ok).toBe(true);
    expect(gate.softIssues.some((i) => i.code === 'supervisor_rejected')).toBe(true);

    const delivery = resolveDeliveryOutcome({
      gate,
      composeText: '```ts:src/index.ts\nexport {};\n```',
      chatSummary: 'done',
      supervisorSummary: 'missing tests',
      supervisorFallback: true,
      writtenFiles: baseGateInput.writtenFiles,
    });
    expect(delivery.deliveryBlocked).toBe(false);
    expect(delivery.needsReview).toBe(true);
    expect(delivery.text).toMatch(/\[NEEDS_REVIEW\]/);
    expect(delivery.text).toMatch(/```/);
  });

  it('blocks when supervisor rejects without fallback', () => {
    const gate = evaluateCompletionGate({
      ...baseGateInput,
      supervisorApproved: false,
      supervisorFallback: false,
      verify: verifyOk,
    });
    expect(gate.ok).toBe(false);
  });
});

describe('fast pipeline gate', () => {
  it('does not block on FAST_PIPELINE_PENDING supervisor', () => {
    const gate = evaluateCompletionGate({
      ...baseGateInput,
      supervisorApproved: false,
      supervisorRaw: 'FAST_PIPELINE_PENDING',
      fastPipeline: true,
      supervisorFallback: true,
      verify: {
        ran: true,
        commands: [{ command: 'npm test', ok: true, exitCode: 0, output: '' }],
        summary: 'npm test: ok',
      },
    });
    expect(gate.issues.some((i) => i.code === 'supervisor_rejected')).toBe(false);
    expect(gate.ok).toBe(true);
  });
});

describe('async verify pending', () => {
  it('marks verifyPending without blocking when devtoolsAsyncVerify', () => {
    const gate = evaluateCompletionGate({
      ...baseGateInput,
      devtoolsAsyncVerify: true,
      supervisorApproved: true,
    });
    expect(gate.verifyPending).toBe(true);
    expect(gate.ok).toBe(true);

    const delivery = resolveDeliveryOutcome({
      gate,
      composeText: '```ts:src/index.ts\nexport {};\n```',
      chatSummary: 'done',
      supervisorFallback: true,
      writtenFiles: baseGateInput.writtenFiles,
    });
    expect(delivery.verifyPending).toBe(true);
    expect(delivery.deliveryBlocked).toBe(false);
    expect(delivery.text).toMatch(/background/i);
  });
});
