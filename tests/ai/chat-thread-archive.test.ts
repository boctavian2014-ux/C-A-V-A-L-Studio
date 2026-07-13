import { describe, expect, it } from 'vitest';

import type { ChatMessage, ChatThread } from '../../ai/composer/ai-store';
import {
  archiveThreadInList,
  archiveThreadsForWorkspaceSwitch,
  migrateThreadsOnRehydrate,
  visibleThreadForWorkspace,
} from '../../ai/composer/ai-store';

function thread(
  id: string,
  workspacePath: string | null,
  opts?: { archived?: boolean; messages?: ChatMessage[] }
): ChatThread {
  return {
    id,
    title: id,
    messages: opts?.messages ?? [],
    createdAt: 1,
    updatedAt: 1,
    workspacePath,
    archived: opts?.archived,
  };
}

describe('chat thread archive helpers', () => {
  it('archiveThreadInList marks thread archived and keeps messages', () => {
    const msg = [{ id: 'm1', role: 'user' as const, content: 'hi' }];
    const threads = [thread('a', '/proj', { messages: [] })];
    const next = archiveThreadInList(threads, 'a', msg);
    expect(next[0]?.archived).toBe(true);
    expect(next[0]?.messages).toEqual(msg);
  });

  it('archiveThreadsForWorkspaceSwitch archives other workspaces', () => {
    const threads = [
      thread('a', '/haine', { messages: [{ id: 'm', role: 'user', content: 'x' }] }),
      thread('b', '/other'),
    ];
    const next = archiveThreadsForWorkspaceSwitch(threads, '/haine', 'a', threads[0]!.messages);
    expect(next.find((t) => t.id === 'a')?.archived).toBeFalsy();
    expect(next.find((t) => t.id === 'b')?.archived).toBe(true);
  });

  it('visibleThreadForWorkspace returns non-archived match', () => {
    const threads = [
      thread('a', '/haine', { archived: true }),
      thread('b', '/haine'),
    ];
    expect(visibleThreadForWorkspace(threads, '/haine')?.id).toBe('b');
  });

  it('migrateThreadsOnRehydrate keeps only active thread visible', () => {
    const threads = [thread('a', '/p1'), thread('b', '/p2'), thread('c', '/p3')];
    const next = migrateThreadsOnRehydrate(threads, 'b');
    expect(next.filter((t) => !t.archived)).toHaveLength(1);
    expect(next.find((t) => !t.archived)?.id).toBe('b');
    expect(next).toHaveLength(3);
  });
});
