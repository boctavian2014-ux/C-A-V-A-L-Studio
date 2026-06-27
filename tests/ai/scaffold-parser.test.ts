import { describe, it, expect } from 'vitest';
import { parseScaffoldFiles, parseStreamingScaffold } from '../../ai/composer/scaffold-parser';

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

  it('assigns default path for fence without header path', () => {
    const text = '```python\nprint("hi")\n```';
    const files = parseScaffoldFiles(text);
    expect(files[0]?.path).toBe('src/main.py');
    expect(files[0]?.content).toContain('print');
  });
});
