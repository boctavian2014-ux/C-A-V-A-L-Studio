import { describe, expect, it } from 'vitest';

import { formatProblemForChat, formatProblemsForChat } from '../../src/renderer/store/problems-store';
import type { ProblemEntry } from '../../src/renderer/store/parse-problems';
import { formatOutputForChat } from '../../src/renderer/store/output-store';

describe('chat export from panel', () => {
  const sample: ProblemEntry = {
    id: 'p1',
    file: 'src/app.ts',
    line: 10,
    col: 5,
    message: 'Cannot find name x',
    severity: 'error',
    source: 'tsc',
  };

  it('formats a single problem for chat', () => {
    const text = formatProblemForChat(sample);
    expect(text).toContain('src/app.ts:10:5');
    expect(text).toContain('Cannot find name x');
  });

  it('formats all problems for chat', () => {
    const text = formatProblemsForChat([sample, { ...sample, id: 'p2', line: 20 }]);
    expect(text).toContain('1. src/app.ts:10:5');
    expect(text).toContain('2. src/app.ts:20:5');
  });

  it('formats output channel for chat', () => {
    const text = formatOutputForChat(['error TS2304', 'Build failed'], 'CAVAL');
    expect(text).toContain('CAVAL');
    expect(text).toContain('error TS2304');
  });
});
