import { describe, expect, it } from 'vitest';
import { parseDecomposition, parseDecompositionOutput } from '../../../ai/composer/multi-agent/decomposition-parser';

const SAMPLE = `
**Project Goal:** Build a todo API

**High-Level Architecture:** REST backend + SQLite

**Modules & Tasks:**
- Module auth: authentication
  - Task A1: JWT login endpoint
  - Task A2: Register endpoint
- Module todos: CRUD
  - Task B1: Todo model and routes
  - Task B2: Integration tests

**Dependencies:** auth before todos
`;

describe('decomposition-parser', () => {
  it('parses tasks from markdown decomposition', () => {
    const tasks = parseDecompositionOutput(SAMPLE, 8);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks[0]!.description).toContain('JWT');
  });

  it('caps tasks at maxTasks with integration bucket', () => {
    const many = Array.from({ length: 12 }, (_, i) => `- Task T${i}: item ${i}`).join('\n');
    const raw = `**Modules & Tasks:**\n${many}`;
    const tasks = parseDecompositionOutput(raw, 8);
    expect(tasks.length).toBeLessThanOrEqual(8);
    const hasIntegration = tasks.some((t) => t.id === 'integration');
    expect(hasIntegration).toBe(true);
  });

  it('falls back to project goal when no tasks found', () => {
    const tasks = parseDecomposition('**Project Goal:** Single script\n\nNo tasks here', 8);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.description).toContain('Single script');
  });
});
