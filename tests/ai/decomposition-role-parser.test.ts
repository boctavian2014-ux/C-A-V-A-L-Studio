import { describe, expect, it } from 'vitest';
import { parseDecompositionOutput } from '../../ai/composer/multi-agent/decomposition-parser';

describe('decomposition role tags', () => {
  it('parses [role:tester] tag', () => {
    const raw = `
**Project Goal:** App
- Module 1: Core — main
- Task 1.1: [role:tester] Add unit tests for API
- Task 1.2: [role:implementer] Implement API handler
`;
    const tasks = parseDecompositionOutput(raw, 8);
    expect(tasks.find((t) => t.id.includes('1-1'))?.role).toBe('tester');
    expect(tasks.find((t) => t.id.includes('1-2'))?.role).toBe('implementer');
  });

  it('defaults role to implementer', () => {
    const raw = `
- Module 1: Core — main
- Task 1.1: Create handler
`;
    const tasks = parseDecompositionOutput(raw, 8);
    expect(tasks[0]?.role).toBe('implementer');
  });
});
