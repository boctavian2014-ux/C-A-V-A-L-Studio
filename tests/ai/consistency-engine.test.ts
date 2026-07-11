import { describe, expect, it } from 'vitest';
import { collectImportIssues, runCavaloConsistencyScan } from '../../ai/composer/consistency-engine';

describe('consistency-engine', () => {
  it('collectImportIssues flags missing relative import', () => {
    const issues = collectImportIssues(
      '/proj',
      [{ path: 'src/foo.ts', content: "import { x } from './missing';" }],
      () => false
    );
    expect(issues.length).toBe(1);
    expect(issues[0]?.importPath).toBe('./missing');
  });

  it('runCavaloConsistencyScan ok for valid ts', async () => {
    const result = await runCavaloConsistencyScan({
      projectPath: '/proj',
      writtenFiles: ['src/ok.ts'],
      readFileContent: async () => 'export const x = 1;',
      fileExists: (p) => p.endsWith('src/ok.ts'),
    });
    expect(result.syntax.length).toBe(0);
    expect(result.ok).toBe(true);
  });
});
