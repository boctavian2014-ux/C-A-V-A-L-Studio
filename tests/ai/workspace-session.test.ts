import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_FOCUS,
  isStaleWorkspace,
  resolveThreadWorkspacePath,
  shouldRestoreThreadWorkspace,
  workspaceFolderTitle,
} from '../../ai/composer/workspace-session';

describe('workspace-session', () => {
  it('isStaleWorkspace when bound path differs from current', () => {
    expect(isStaleWorkspace('/proj/a', '/proj/b')).toBe(true);
    expect(isStaleWorkspace('/proj/a', '/proj/a')).toBe(false);
    expect(isStaleWorkspace(null, null)).toBe(false);
    expect(isStaleWorkspace('/proj/a', null)).toBe(true);
    expect(isStaleWorkspace(null, '/proj/a')).toBe(false);
    expect(isStaleWorkspace('C:\\proj\\app', 'C:/proj/app')).toBe(false);
  });

  it('workspaceFolderTitle uses last path segment', () => {
    expect(workspaceFolderTitle('C:\\Users\\dev\\my-app')).toBe('my-app');
    expect(workspaceFolderTitle('/home/dev/my-app')).toBe('my-app');
    expect(workspaceFolderTitle(null)).toBe('Chat nou');
    expect(workspaceFolderTitle('')).toBe('Chat nou');
  });

  it('resolveThreadWorkspacePath prefers thread bind then last message', () => {
    expect(resolveThreadWorkspacePath({ workspacePath: 'C:\\landing' })).toBe('C:\\landing');
    expect(
      resolveThreadWorkspacePath({
        workspacePath: null,
        messages: [
          { workspacePath: 'C:\\old' },
          { workspacePath: 'C:\\landingpage caval' },
        ],
      })
    ).toBe('C:\\landingpage caval');
    expect(resolveThreadWorkspacePath({ messages: [{}, {}] })).toBeNull();
    expect(resolveThreadWorkspacePath(null)).toBeNull();
  });

  it('shouldRestoreThreadWorkspace when chat remembers a folder Explorer does not have open', () => {
    expect(shouldRestoreThreadWorkspace('C:\\landing', null)).toBe(true);
    expect(shouldRestoreThreadWorkspace('C:\\landing', 'C:/landing')).toBe(false);
    expect(shouldRestoreThreadWorkspace('C:\\a', 'C:\\b')).toBe(true);
    expect(shouldRestoreThreadWorkspace(null, null)).toBe(false);
    expect(shouldRestoreThreadWorkspace('', 'C:\\proj')).toBe(false);
  });

  it('DEFAULT_SESSION_FOCUS enables single-project behavior', () => {
    expect(DEFAULT_SESSION_FOCUS.singleProjectFocus).toBe(true);
    expect(DEFAULT_SESSION_FOCUS.newThreadOnWorkspaceChange).toBe(true);
  });
});
