import { describe, expect, it } from 'vitest';
import {
  parseReasoningFromDecomposition,
  buildEarlyArenaMessage,
  buildFinalRecap,
} from '../../ai/composer/reasoning-brief';

describe('reasoning-brief', () => {
  const decomp = `**Project Goal:** Build a REST API for users.

**High-Level Architecture:** Express + SQLite with layered modules.

**Tasks**
- auth module
`;

  it('parses goal and architecture from decomposition', () => {
    const brief = parseReasoningFromDecomposition(decomp, 'fallback prompt', [
      { id: 't1', module: 'auth', purpose: 'login', description: 'JWT auth', dependencies: [] },
    ]);
    expect(brief.goal).toContain('REST API');
    expect(brief.approach).toContain('Express');
    expect(brief.modules).toEqual(['auth']);
  });

  it('falls back to user message when sections missing', () => {
    const brief = parseReasoningFromDecomposition('no headings', 'Create todo app');
    expect(brief.goal).toBe('Create todo app');
    expect(brief.approach.length).toBeGreaterThan(0);
  });

  it('buildEarlyArenaMessage is two lines', () => {
    const msg = buildEarlyArenaMessage({
      goal: 'Ship feature X',
      approach: 'Modular TS services',
      modules: ['core'],
    });
    expect(msg.split('\n')).toHaveLength(2);
    expect(msg).toContain('Goal:');
    expect(msg).toContain('Plan:');
  });

  it('buildFinalRecap includes files and next steps', () => {
    const recap = buildFinalRecap({
      brief: { goal: 'g', approach: 'a', modules: [] },
      writtenFiles: ['src/a.ts', 'src/b.ts'],
      taskCount: 2,
      fastPipeline: true,
      supervisor: { approved: true, raw: 'FAST_PIPELINE', issues: [], summary: 'fast path ok' },
      devTools: {
        terminal: { packageJson: true, testScript: true, buildScript: true },
        git: { isRepo: true, changedFiles: 2 },
      },
    });
    expect(recap).toContain('Implementat: 2');
    expect(recap).toContain('Decizii:');
    expect(recap).toContain('Next:');
    expect(recap).not.toContain('Lipsă:');
  });

  it('omits pending line when no issues', () => {
    const recap = buildFinalRecap({
      brief: { goal: 'g', approach: 'a', modules: [] },
      writtenFiles: ['src/a.ts'],
      taskCount: 1,
      fastPipeline: true,
      supervisor: { approved: true, raw: 'FAST_PIPELINE', issues: [], summary: 'fast path ok' },
    });
    expect(recap.split('\n')).toHaveLength(3);
    expect(recap).not.toMatch(/Lipsă|Pending/);
  });
});
