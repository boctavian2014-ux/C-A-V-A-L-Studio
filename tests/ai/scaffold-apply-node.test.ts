import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  applyScaffoldToWorkspaceNode,
  collectPipelineScaffoldContent,
} from '../../ai/composer/scaffold-apply-node';
import { PipelineContextStore } from '../../ai/composer/multi-agent/pipeline-context-store';

describe('scaffold-apply-node', () => {
  it('writes files from compose output on disk', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-scaffold-'));
    const content = [
      'Plan recap here.',
      '```typescript:src/hello.ts',
      'export const hello = "world";',
      '```',
    ].join('\n');

    const written = applyScaffoldToWorkspaceNode(root, content);
    expect(written).toContain('src/hello.ts');
    expect(fs.readFileSync(path.join(root, 'src', 'hello.ts'), 'utf8')).toContain('hello');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('collects sub-agent outputs when composer is empty', () => {
    const store = new PipelineContextStore({
      userMessage: 'build app',
      workspaceRoot: '/tmp',
      context: {
        normalizedRequirements: 'app',
        architectureContext: '',
        interfaceContext: '',
        dependencyMap: '',
        storeCompliance: [],
        pendingIssues: [],
      },
    });
    store.setTasks([
      {
        id: 't1',
        module: 'core',
        purpose: 'core',
        description: 'core module',
        dependencies: [],
      },
    ]);
    store.setSubAgentOutput(
      't1',
      '```typescript:src/core.ts\nexport const core = 1;\n```'
    );

    const collected = collectPipelineScaffoldContent('', store);
    expect(collected).toContain('src/core.ts');
    expect(parseFrom(collected)).toContain('src/core.ts');
  });
});

function parseFrom(content: string): string[] {
  const re = /```[\w.-]+(?::([^\n`]+))?\s*\n/g;
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) paths.push(m[1].trim());
  }
  return paths;
}
