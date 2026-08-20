import { describe, expect, it, beforeEach } from 'vitest';

import { useOutputStore } from '../../src/renderer/store/output-store';

describe('output-store', () => {
  beforeEach(() => {
    useOutputStore.setState({
      channels: [{ name: 'CAVAL', lines: [] }],
      activeChannel: 'CAVAL',
    });
  });

  it('appends lines to channels and creates missing channels', () => {
    const store = useOutputStore.getState();
    store.append('CAVAL', 'line 1');
    store.append('BUILD', 'webpack ok');
    expect(useOutputStore.getState().channels).toHaveLength(2);
    expect(useOutputStore.getState().channels[1]?.lines).toEqual(['webpack ok']);
  });

  it('appendBlock splits multiline text', () => {
    useOutputStore.getState().appendBlock('CAVAL', 'a\nb\nc');
    expect(useOutputStore.getState().channels[0]?.lines).toEqual(['a', 'b', 'c']);
  });

  it('caps channel lines at 1000', () => {
    const store = useOutputStore.getState();
    store.appendBlock('CAVAL', Array.from({ length: 1005 }, (_, i) => `line-${i}`).join('\n'));
    const lines = useOutputStore.getState().channels[0]?.lines ?? [];
    expect(lines).toHaveLength(1000);
    expect(lines[0]).toBe('line-5');
    expect(lines[999]).toBe('line-1004');
  });

  it('switches active channel', () => {
    useOutputStore.getState().setActiveChannel('TASKS');
    expect(useOutputStore.getState().activeChannel).toBe('TASKS');
    expect(useOutputStore.getState().channels.some((c) => c.name === 'TASKS')).toBe(true);
  });
});
