import { describe, it, expect } from 'vitest';
import {
  parseScaffoldFiles,
  parseStreamingScaffold,
  pickCodeStreamOutput,
  inferExtensionFromContent,
  isScaffoldFragment,
  isBlockedScaffoldPath,
  isJunkCodeFileContent,
  repairScaffoldComposerExport,
} from '../../ai/composer/scaffold-parser';

describe('scaffold-parser', () => {
  it('parses path in fence header', () => {
    const text = 'Here:\n```typescript:src/app.ts\nexport const x = 1;\n```';
    const files = parseScaffoldFiles(text);
    expect(files).toEqual([{ path: 'src/app.ts', content: 'export const x = 1;' }]);
  });

  it('parses JSON files array', () => {
    const text = '```json\n{"files":[{"path":"package.json","content":"{}"}]}\n```';
    expect(parseScaffoldFiles(text)[0]?.path).toBe('package.json');
  });

  it('parses incomplete streaming fence', () => {
    const text = 'Start\n```typescript:src/app.ts\nexport const x = 1;\nconst y = 2';
    const live = parseStreamingScaffold(text);
    expect(live?.path).toBe('src/app.ts');
    expect(live?.content).toContain('export const x');
  });

  it('parses plain lang fence without colon path', () => {
    const text = '```python\nprint("hi")\n```';
    const files = parseScaffoldFiles(text);
    expect(files[0]?.path).toBe('src/main.py');
    expect(files[0]?.content).toContain('print');
  });

  it('pickCodeStreamOutput prefers reasoning when only reasoning has fences', () => {
    const reasoning = 'Plan\n```python:core/x.py\nx=1\n```';
    expect(pickCodeStreamOutput('', reasoning)).toContain('```python');
  });

  it('maps bash/sh fences to .sh default path', () => {
    const text = '```bash\necho "hi"\n```';
    expect(parseScaffoldFiles(text)[0]?.path).toBe('src/main.sh');
  });

  it('infers .py from python-like body when lang tag is text', () => {
    const body = 'def detect_pitch():\n    return 440';
    expect(inferExtensionFromContent(body)).toBe('py');
    const text = '```text\ndef detect_pitch():\n    return 440\n```';
    const files = parseScaffoldFiles(text);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/main.py');
    expect(files[0]?.content).toContain('detect_pitch');
  });

  it('infers .ts from typescript export in unknown lang fence', () => {
    const text = '```plaintext\nexport const x = 1;\n```';
    expect(parseScaffoldFiles(text)[0]?.path).toBe('src/main.ts');
  });

  it('falls back to .txt only when lang and content are unrecognizable', () => {
    expect(inferExtensionFromContent('plain notes\nno code here')).toBeNull();
    const text = '```text\nplain notes\nno code\n```';
    expect(parseScaffoldFiles(text)[0]?.path).toBe('src/main.txt');
  });

  it('accepts explicit .txt path in fence header', () => {
    const text = '```text:docs/notes.txt\nhello\n```';
    expect(parseScaffoldFiles(text)[0]?.path).toBe('docs/notes.txt');
  });

  it('accepts Dockerfile path without extension', () => {
    const text = '```dockerfile:Dockerfile\nFROM node:20\n```';
    expect(parseScaffoldFiles(text)[0]?.path).toBe('Dockerfile');
  });

  it('rejects context-builder fragment without explicit path', () => {
    const text = [
      '```typescript',
      "let ctx = '';",
      'if (tab && tab.path) {',
      '  ctx += tab.path;',
      '}',
      'return ctx;',
      '```',
    ].join('\n');
    expect(parseScaffoldFiles(text)).toHaveLength(0);
    expect(isScaffoldFragment("let ctx = '';\nif (tab && tab.path) {}\nreturn ctx;")).toBe(true);
  });

  it('rejects ai-store snippet fragments', () => {
    const text = '```typescript\nconst stopStreaming = () => {\n  abortController?.abort();\n};\n```';
    expect(parseScaffoldFiles(text)).toHaveLength(0);
  });

  it('accepts valid module with explicit path even after fragment rejection', () => {
    const text = '```typescript:src/app.ts\nexport const x = 1;\n```';
    expect(parseScaffoldFiles(text)).toEqual([{ path: 'src/app.ts', content: 'export const x = 1;' }]);
  });

  it('rejects multiple anonymous fragment fences', () => {
    const fragment = "let ctx = '';\nreturn ctx;";
    const text = `\`\`\`typescript\n${fragment}\n\`\`\`\n\`\`\`typescript\n${fragment}\n\`\`\``;
    expect(parseScaffoldFiles(text)).toHaveLength(0);
  });

  it('parseStreamingScaffold returns null for fragment body', () => {
    const text = '```typescript\nreturn ctx;\n```';
    expect(parseStreamingScaffold(text)).toBeNull();
  });

  it('blocks scaffold under src/zero-latency (built-in module path)', () => {
    const text = [
      '```typescript:src/zero-latency/server.ts',
      "import { composer } from './composer';",
      'composer.prepare({ workspaceRoot: "/p" });',
      '```',
    ].join('\n');
    expect(parseScaffoldFiles(text)).toHaveLength(0);
    expect(isBlockedScaffoldPath('src/zero-latency/server.ts')).toBe(true);
  });

  it('repairs composer.ts to export composer alias', () => {
    const body = [
      'export class ZeroLatencyComposer {',
      '  prepare() { return "ok"; }',
      '}',
      'export const zeroLatencyComposer = new ZeroLatencyComposer();',
    ].join('\n');
    const fixed = repairScaffoldComposerExport('src/zero-latency/composer.ts', body);
    expect(fixed).toContain('export const composer = zeroLatencyComposer');
  });

  it('rejects markdown pasted into anonymous typescript fence (src/index.ts)', () => {
    const text = [
      '```typescript',
      '## PROJECT SUMMARY',
      'Robot ESP32 pe roti.',
      '## COMPONENT LIST',
      '| Name | Qty |',
      '```',
    ].join('\n');
    expect(parseScaffoldFiles(text)).toHaveLength(0);
    expect(isJunkCodeFileContent('src/index.ts', '## PROJECT SUMMARY\nRobot')).toBe(true);
  });

  it('rejects zero-latency-composer package.json scaffold', () => {
    const pkg = JSON.stringify({
      name: 'zero-latency-composer',
      version: '1.0.0',
      scripts: { build: 'tsc' },
    });
    const text = `\`\`\`json:package.json\n${pkg}\n\`\`\``;
    expect(parseScaffoldFiles(text)).toHaveLength(0);
    expect(isJunkCodeFileContent('package.json', pkg)).toBe(true);
  });

  it('blocks zero-latency-composer folder paths', () => {
    expect(isBlockedScaffoldPath('zero-latency-composer/src/index.ts')).toBe(true);
  });

  it('blocks cavallo_task_generator in user workspace', () => {
    expect(isBlockedScaffoldPath('cavallo_task_generator/core.py')).toBe(true);
  });
});
