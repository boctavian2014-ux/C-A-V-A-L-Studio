import { describe, expect, it } from 'vitest';
import { sanitizeLiveReasoning } from '../../ai/composer/chat-display';
import { patchMultiAgentSteps } from '../../ai/composer/chat-activity-types';

describe('arena work panel helpers', () => {
  it('sanitizeLiveReasoning caps lines and strips fences', () => {
    const raw = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    raw.concat('\n```ts\ncode\n```');
    const out = sanitizeLiveReasoning(`${raw}\n\`\`\`ts\ncode\n\`\`\``);
    expect(out.split('\n').length).toBeLessThanOrEqual(13);
    expect(out).not.toContain('```');
  });

  it('patchMultiAgentSteps accumulates active then done', () => {
    let steps = patchMultiAgentSteps(undefined, 'memory', 'active', 'init');
    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe('active');

    steps = patchMultiAgentSteps(steps, 'memory', 'done', 'ok');
    expect(steps[0]?.status).toBe('done');

    steps = patchMultiAgentSteps(steps, 'decompose', 'active', '3 tasks');
    expect(steps).toHaveLength(2);
    expect(steps[1]?.phase).toBe('decompose');
    expect(steps[1]?.status).toBe('active');
  });

  it('patchMultiAgentSteps marks prior active as done when new phase starts', () => {
    let steps = patchMultiAgentSteps(undefined, 'context', 'active');
    steps = patchMultiAgentSteps(steps, 'decompose', 'active');
    expect(steps.find((s) => s.phase === 'context')?.status).toBe('done');
    expect(steps.find((s) => s.phase === 'decompose')?.status).toBe('active');
  });
});
