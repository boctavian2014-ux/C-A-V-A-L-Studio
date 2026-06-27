import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../../ai/tools/tool-registry';
import { summarizeForChatPanel } from '../../ai/composer/chat-display';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('write_file tool', () => {
  it('rejects empty content so the model must send real code', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'caval-tool-'));
    const registry = new ToolRegistry(root);
    const result = await registry.execute({
      name: 'write_file',
      arguments: { path: 'test.ts', content: '   ' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-empty content/i);
  });

  it('accepts alternate argument names from some models', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'caval-tool-'));
    const registry = new ToolRegistry(root);
    const result = await registry.execute({
      name: 'write_file',
      arguments: { file_path: 'src/app.ts', code: 'export const x = 1;\n' },
    });
    expect(result.ok).toBe(true);
    const written = await fs.readFile(path.join(root, 'src', 'app.ts'), 'utf8');
    expect(written).toContain('export const x');
  });
});

describe('chat-display tool notices', () => {
  it('strips tool call markers from arena chat', () => {
    const raw = '🔧 *list_dir*…\n🔧 *write_file*…\n✓ Done';
    const summary = summarizeForChatPanel(raw);
    expect(summary.lines.join(' ')).not.toContain('list_dir');
    expect(summary.lines.some((l) => l.includes('Done'))).toBe(true);
  });
});
