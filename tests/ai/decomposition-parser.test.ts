import { describe, expect, it } from 'vitest';
import { parseDecompositionOutput } from '../../ai/composer/multi-agent/decomposition-parser';

describe('decomposition-parser phase:ui', () => {
  it('parses [phase:ui] tag from task line', () => {
    const raw = `
**Project Goal:** Todo app
**Modules & Tasks:**
- Module frontend: UI
  - Task ui-1: [phase:ui] React shell with routing
  - Task api-1: Express REST API
`;
    const tasks = parseDecompositionOutput(raw, 8);
    const uiTask = tasks.find((t) => t.id === 'ui-1');
    expect(uiTask?.phase).toBe('ui');
    expect(uiTask?.description).not.toMatch(/\[phase:ui\]/i);
    const apiTask = tasks.find((t) => t.id === 'api-1');
    expect(apiTask?.phase).toBeUndefined();
  });
});
