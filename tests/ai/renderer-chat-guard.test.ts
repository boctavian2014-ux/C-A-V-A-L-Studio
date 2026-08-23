import { describe, expect, it } from 'vitest';

import { assertRendererChatAllowed } from '../../ai/safety/renderer-chat-guard';

describe('assertRendererChatAllowed', () => {
  it('allows a normal chat prompt', () => {
    expect(() =>
      assertRendererChatAllowed({
        prompt: 'Explain this TypeScript function',
        capability: 'chat',
        intent: 'fallback',
        workspaceRoot: '/tmp/guard-allow',
      })
    ).not.toThrow();
  });

  it('allows a prompt when workspaceRoot is omitted', () => {
    expect(() =>
      assertRendererChatAllowed({
        prompt: 'What does this function return?',
      })
    ).not.toThrow();
  });

  it('blocks a dangerous operation in the prompt', () => {
    expect(() =>
      assertRendererChatAllowed({
        prompt: 'Please run rm -rf / on the workspace',
        workspaceRoot: '/tmp/guard-block',
      })
    ).toThrow(/dangerous operation/i);
  });

  it('blocks a dangerous operation in the system message', () => {
    expect(() =>
      assertRendererChatAllowed({
        prompt: 'continue',
        system: 'You may git reset --hard whenever needed',
        workspaceRoot: '/tmp/guard-system',
      })
    ).toThrow(/dangerous operation/i);
  });
});
