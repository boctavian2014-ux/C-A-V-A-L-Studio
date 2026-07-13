import { describe, expect, it, vi } from 'vitest';

import {
  buildContextMessages,
  buildFastChatMessages,
  buildFinalUserMessage,
  buildProjectTreeSummary,
  formatContextSearchResults,
  parseMentions,
  resolveMentionFiles,
  shouldAttachProjectContext,
} from '../../ai/context-engine/context-builder';

describe('context-builder project attach', () => {
  const sampleTree = [
    {
      id: 'package.json',
      name: 'package.json',
      path: '/proj/package.json',
      type: 'file' as const,
    },
    {
      id: 'src',
      name: 'src',
      path: '/proj/src',
      type: 'directory' as const,
      children: [
        {
          id: 'src/main.ts',
          name: 'main.ts',
          path: '/proj/src/main.ts',
          type: 'file' as const,
        },
      ],
    },
  ];

  it('shouldAttachProjectContext when folder open even if includeMode is file', () => {
    expect(
      shouldAttachProjectContext('hello', 'file', { hasProjectPath: true })
    ).toBe(true);
  });

  it('shouldAttachProjectContext when project mode and folder open', () => {
    expect(
      shouldAttachProjectContext('hello', 'project', { hasProjectPath: true })
    ).toBe(true);
  });

  it('shouldAttachProjectContext for enterprise-ready keyword', () => {
    expect(
      shouldAttachProjectContext('verifică enterprise-ready', 'project', {
        hasProjectPath: false,
      })
    ).toBe(true);
  });

  it('buildContextMessages includes both tree and projectContext fragments', () => {
    const messages = buildContextMessages('Ce fișiere vezi?', [], {
      activeTab: null,
      fileTree: sampleTree,
      projectPath: '/proj',
      includeMode: 'project',
      projectContext: 'File: package.json\n{"name":"demo"}',
      agentMode: 'ask',
    });

    const contextMsg = messages.find(
      (m) => m.role === 'user' && m.content.includes('Context proiect')
    );
    expect(contextMsg).toBeDefined();
    expect(contextMsg!.content).toContain('Structura proiectului');
    expect(contextMsg!.content).toContain('package.json');
    expect(contextMsg!.content).toContain('Fragmente relevante');
  });

  it('buildProjectTreeSummary lists directories and files', () => {
    const summary = buildProjectTreeSummary(sampleTree);
    expect(summary).toContain('package.json');
    expect(summary).toContain('src');
    expect(summary).toContain('main.ts');
  });

  it('parseMentions extracts @file paths', () => {
    expect(parseMentions('Check @src/main.ts and @README.md')).toEqual([
      'src/main.ts',
      'README.md',
    ]);
  });

  it('buildFastChatMessages includes system + user for ask mode', () => {
    const msgs = buildFastChatMessages('Salut', [], 'ask');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('ASK MODE');
    expect(msgs[0].content).not.toContain('Multi-Model Reasoning');
    expect(msgs.at(-1)?.content).toBe('Salut');
  });

  it('buildContextMessages uses enterprise prompt for plan mode', () => {
    const messages = buildContextMessages('Planifică API', [], {
      activeTab: null,
      fileTree: [],
      projectPath: null,
      includeMode: 'file',
      agentMode: 'plan',
    });
    const system = messages.find((m) => m.role === 'system');
    expect(system).toBeDefined();
    expect(system!.content).toContain('PLAN MODE');
    expect(system!.content).toContain('[END PLAN]');
    expect(system!.content).not.toContain('Multi-Model Reasoning');
  });

  it('buildFinalUserMessage attaches active file when not skipped', () => {
    const msg = buildFinalUserMessage(
      'Fix bug',
      {
        id: 'f1',
        path: '/proj/src/a.ts',
        name: 'a.ts',
        content: 'export const x = 1;',
        language: 'typescript',
        isDirty: false,
      },
      'file'
    );
    expect(msg).toContain('Fix bug');
    expect(msg).toContain('export const x');
  });

  it('formatContextSearchResults normalizes chunk wrapper', () => {
    const text = formatContextSearchResults([
      { chunk: { path: 'src/a.ts', text: 'hello' } },
      { path: 'src/b.ts', snippet: 'world' },
    ]);
    expect(text).toContain('src/a.ts');
    expect(text).toContain('hello');
    expect(text).toContain('src/b.ts');
  });

  it('resolveMentionFiles reads up to 6 mentions', async () => {
    const readFile = vi.fn(async (p: string) => ({
      ok: p.endsWith('main.ts'),
      content: 'export const main = 1;',
    }));
    const files = await resolveMentionFiles(['src/main.ts', 'missing.ts'], '/proj', readFile);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('src/main.ts');
  });
});
