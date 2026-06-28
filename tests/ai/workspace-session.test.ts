import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_FOCUS,
  isStaleWorkspace,
  workspaceFolderTitle,
} from '../../ai/composer/workspace-session';

describe('workspace-session', () => {
  it('isStaleWorkspace when bound path differs from current', () => {
    expect(isStaleWorkspace('/proj/a', '/proj/b')).toBe(true);
    expect(isStaleWorkspace('/proj/a', '/proj/a')).toBe(false);
    expect(isStaleWorkspace(null, null)).toBe(false);
    expect(isStaleWorkspace('/proj/a', null)).toBe(true);
    expect(isStaleWorkspace(null, '/proj/a')).toBe(true);
  });

  it('workspaceFolderTitle uses last path segment', () => {
    expect(workspaceFolderTitle('C:\\Users\\dev\\my-app')).toBe('my-app');
    expect(workspaceFolderTitle('/home/dev/my-app')).toBe('my-app');
    expect(workspaceFolderTitle(null)).toBe('Chat nou');
    expect(workspaceFolderTitle('')).toBe('Chat nou');
  });

  it('DEFAULT_SESSION_FOCUS enables single-project behavior', () => {
    expect(DEFAULT_SESSION_FOCUS.singleProjectFocus).toBe(true);
    expect(DEFAULT_SESSION_FOCUS.newThreadOnWorkspaceChange).toBe(true);
  });
});
