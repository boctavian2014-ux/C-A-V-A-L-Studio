import { describe, expect, it } from 'vitest';

import {
  createInitialTerminalSession,
  createTerminalSessionMeta,
  resetTerminalSessionCounter,
} from '../../src/renderer/terminal/terminal-sessions';

const expectedTitle = (index: number) =>
  process.platform === 'win32' ? `pwsh ${index}` : `terminal ${index}`;

describe('terminal-sessions', () => {
  it('creates unique session ids and container ids', () => {
    resetTerminalSessionCounter();
    const a = createTerminalSessionMeta(0);
    const b = createTerminalSessionMeta(1);
    expect(a.id).not.toBe(b.id);
    expect(a.containerId).toContain(a.id);
    expect(b.title).toBe(expectedTitle(2));
  });

  it('initial session starts at index 1', () => {
    resetTerminalSessionCounter();
    const initial = createInitialTerminalSession();
    expect(initial.title).toBe(expectedTitle(1));
  });
});
