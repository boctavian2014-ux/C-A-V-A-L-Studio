import fs from 'node:fs';
import path from 'node:path';

import type { ArenaIssue } from './types';

const SECURITY_PATTERNS: Array<{ pattern: RegExp; message: string; severity: ArenaIssue['severity'] }> = [
  { pattern: /\beval\s*\(/, message: 'eval() usage detected', severity: 'critical' },
  { pattern: /dangerouslySetInnerHTML/, message: 'dangerouslySetInnerHTML without sanitization', severity: 'major' },
  { pattern: /\.innerHTML\s*=/, message: 'direct innerHTML assignment', severity: 'major' },
  { pattern: /(?:api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{8,}['"]/i, message: 'possible hardcoded secret', severity: 'critical' },
  { pattern: /SELECT\s+.+\s+FROM\s+.+\$\{/i, message: 'possible SQL injection via template literal', severity: 'critical' },
];

export interface SecurityScanResult {
  issues: ArenaIssue[];
  summary: string;
}

export function runStaticSecurityScan(
  workspaceRoot: string,
  relativeFiles: string[]
): SecurityScanResult {
  const issues: ArenaIssue[] = [];

  for (const rel of relativeFiles) {
    const abs = path.join(workspaceRoot, rel.replace(/\//g, path.sep));
    let content = '';
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    for (const rule of SECURITY_PATTERNS) {
      if (rule.pattern.test(content)) {
        issues.push({
          severity: rule.severity,
          source: 'security-static',
          file: rel,
          message: rule.message,
        });
      }
    }
  }

  const summary =
    issues.length === 0
      ? '✓ Security static scan OK'
      : `✗ Security: ${issues.length} issue(s) — ${issues[0]!.message}`;

  return { issues, summary };
}
