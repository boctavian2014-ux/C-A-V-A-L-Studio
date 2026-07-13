import { describe, expect, it } from 'vitest';

import { getScaffoldFileTier, sortScaffoldFiles } from '../../ai/composer/scaffold-order';
import type { ParsedScaffoldFile } from '../../ai/composer/scaffold-parser';

function files(paths: string[]): ParsedScaffoldFile[] {
  return paths.map((p) => ({ path: p, content: `// ${p}` }));
}

describe('sortScaffoldFiles', () => {
  it('writes package.json before types and components', () => {
    const input = files([
      'web/src/components/MatchResults.tsx',
      'web/src/types.ts',
      'package.json',
      'web/src/api/matching.ts',
    ]);

    const sorted = sortScaffoldFiles(input).map((f) => f.path);

    expect(sorted[0]).toBe('package.json');
    expect(sorted.indexOf('web/src/types.ts')).toBeLessThan(
      sorted.indexOf('web/src/components/MatchResults.tsx')
    );
    expect(sorted.indexOf('web/src/api/matching.ts')).toBeLessThan(
      sorted.indexOf('web/src/components/MatchResults.tsx')
    );
  });

  it('orders entry points after app shell files', () => {
    const input = files(['web/src/main.tsx', 'web/src/App.tsx', 'README.md', 'web/src/index.ts']);
    const sorted = sortScaffoldFiles(input).map((f) => f.path);

    expect(sorted.indexOf('web/src/App.tsx')).toBeLessThan(sorted.indexOf('web/src/main.tsx'));
    expect(sorted.indexOf('web/src/main.tsx')).toBeLessThan(sorted.indexOf('README.md'));
  });

  it('prefers shallower paths within the same tier', () => {
    const input = files([
      'web/src/components/ui/Button.tsx',
      'web/src/components/App.tsx',
    ]);
    const sorted = sortScaffoldFiles(input).map((f) => f.path);

    expect(sorted[0]).toBe('web/src/components/App.tsx');
  });

  it('assigns expected tiers', () => {
    expect(getScaffoldFileTier('package.json')).toBe(1);
    expect(getScaffoldFileTier('tsconfig.json')).toBe(2);
    expect(getScaffoldFileTier('web/src/types.ts')).toBe(3);
    expect(getScaffoldFileTier('web/src/utils/format.ts')).toBe(4);
    expect(getScaffoldFileTier('web/src/api/matching.ts')).toBe(5);
    expect(getScaffoldFileTier('web/src/hooks/useMatch.ts')).toBe(6);
    expect(getScaffoldFileTier('web/src/App.tsx')).toBe(7);
    expect(getScaffoldFileTier('web/src/main.tsx')).toBe(8);
    expect(getScaffoldFileTier('web/src/App.test.tsx')).toBe(9);
    expect(getScaffoldFileTier('README.md')).toBe(10);
  });
});
