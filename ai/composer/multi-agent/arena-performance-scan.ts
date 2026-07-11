import fs from 'node:fs';
import path from 'node:path';

import type { ArenaIssue } from './types';

const PERF_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /useEffect\s*\(\s*[^,)]+\s*\)/, message: 'useEffect missing dependency array' },
  { pattern: /for\s*\([^)]+\)\s*\{[^}]*for\s*\(/, message: 'nested loops detected' },
  { pattern: /JSON\.parse\s*\([^)]+\)[^;]*for\s*\(/, message: 'JSON.parse inside loop' },
  { pattern: /import\s+\*\s+as\s+/, message: 'wildcard import may increase bundle size' },
];

const LARGE_FILE_KB = 80;

export interface PerformanceScanResult {
  issues: ArenaIssue[];
  optimizationPlan: string;
  summary: string;
}

export function runStaticPerformanceScan(
  workspaceRoot: string,
  relativeFiles: string[]
): PerformanceScanResult {
  const issues: ArenaIssue[] = [];

  for (const rel of relativeFiles) {
    const abs = path.join(workspaceRoot, rel.replace(/\//g, path.sep));
    let content = '';
    let sizeKb = 0;
    try {
      const stat = fs.statSync(abs);
      sizeKb = stat.size / 1024;
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    if (sizeKb > LARGE_FILE_KB && /\.(ts|tsx|js|jsx)$/.test(rel)) {
      issues.push({
        severity: 'minor',
        source: 'performance-static',
        file: rel,
        message: `Large file (${Math.round(sizeKb)}KB) — consider splitting`,
      });
    }

    for (const rule of PERF_PATTERNS) {
      if (rule.pattern.test(content)) {
        issues.push({
          severity: 'major',
          source: 'performance-static',
          file: rel,
          message: rule.message,
        });
      }
    }
  }

  const optimizationPlan =
    issues.length > 0
      ? `Optimize: ${issues.slice(0, 5).map((i) => `${i.file ?? '?'}: ${i.message}`).join('; ')}`
      : 'No critical performance issues detected';

  const summary =
    issues.length === 0
      ? '✓ Performance static scan OK'
      : `✗ Performance: ${issues.length} bottleneck(s)`;

  return { issues, optimizationPlan, summary };
}
