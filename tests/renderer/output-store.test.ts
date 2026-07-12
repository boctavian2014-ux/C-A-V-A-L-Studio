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

  it('switches active channel', () => {
    useOutputStore.getState().setActiveChannel('TASKS');
    expect(useOutputStore.getState().activeChannel).toBe('TASKS');
    expect(useOutputStore.getState().channels.some((c) => c.name === 'TASKS')).toBe(true);
  });
});
