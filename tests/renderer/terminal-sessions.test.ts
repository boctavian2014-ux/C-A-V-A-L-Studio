import { describe, expect, it } from 'vitest';

import {
  createInitialTerminalSession,
  createTerminalSessionMeta,
  resetTerminalSessionCounter,
} from '../../src/renderer/terminal/terminal-sessions';

describe('terminal-sessions', () => {
  it('creates unique session ids and container ids', () => {
    resetTerminalSessionCounter();
    const a = createTerminalSessionMeta(0);
    const b = createTerminalSessionMeta(1);
    expect(a.id).not.toBe(b.id);
    expect(a.containerId).toContain(a.id);
    expect(b.title).toMatch(/powershell 2/);
  });

  it('initial session starts at index 1', () => {
    resetTerminalSessionCounter();
    const initial = createInitialTerminalSession();
    expect(initial.title).toBe('powershell 1');
  });
});
