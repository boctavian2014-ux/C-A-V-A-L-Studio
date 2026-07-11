import { describe, expect, it } from 'vitest';
import { runStaticSecurityScan } from '../../ai/composer/multi-agent/arena-security-scan';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('arena-security-scan', () => {
  it('detects eval in file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-sec-'));
    const file = path.join(dir, 'bad.ts');
    fs.writeFileSync(file, 'eval("1")');
    const result = runStaticSecurityScan(dir, ['bad.ts']);
    expect(result.issues.length).toBeGreaterThan(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
