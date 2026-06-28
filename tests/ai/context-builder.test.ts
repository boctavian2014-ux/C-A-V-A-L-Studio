import { describe, expect, it } from 'vitest';

import {
  buildContextMessages,
  buildProjectTreeSummary,
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
});
