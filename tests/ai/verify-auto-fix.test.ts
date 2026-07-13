import { describe, expect, it } from 'vitest';

import {
  extractMissingModules,
  extractRelativeModuleErrors,
} from '../../ai/tools/verify-auto-fix';
import { assertShellCommandAllowed } from '../../src/main/shell-security';

describe('verify-auto-fix', () => {
  it('extracts bare and scoped packages from verify output', () => {
    const output = [
      "error TS2307: Cannot find module 'lucide-react' or its corresponding type declarations.",
      "Module not found: Error: Can't resolve '@tanstack/react-query'",
      "Cannot find module 'axios'",
    ].join('\n');
    const modules = extractMissingModules(output);
    expect(modules).toContain('lucide-react');
    expect(modules).toContain('@tanstack/react-query');
    expect(modules).toContain('axios');
    expect(modules.some((m) => m.startsWith('.'))).toBe(false);
  });

  it('ignores relative import paths in extractMissingModules', () => {
    const output = "Cannot find module './components/Header'";
    expect(extractMissingModules(output)).toEqual([]);
  });

  it('extracts relative module paths from TS2307 output', () => {
    const output = [
      "src/api.ts(1,50): error TS2307: Cannot find module '../types' or its corresponding type declarations.",
      "src/api/index.ts(1,30): error TS2307: Cannot find module './api' or its corresponding type declarations.",
    ].join('\n');
    const errors = extractRelativeModuleErrors(output);
    expect(errors.some((e) => e.modulePath === '../types')).toBe(true);
    expect(errors.some((e) => e.modulePath === './api')).toBe(true);
    expect(errors.find((e) => e.modulePath === '../types')?.file).toContain('api.ts');
  });
});

describe('shell-security npm install', () => {
  it('allows bare npm install', () => {
    expect(() => assertShellCommandAllowed('npm install')).not.toThrow();
  });

  it('allows npm install with package names', () => {
    expect(() => assertShellCommandAllowed('npm install lucide-react axios')).not.toThrow();
    expect(() =>
      assertShellCommandAllowed('npm install @tanstack/react-query')
    ).not.toThrow();
  });

  it('blocks chained shell injection', () => {
    expect(() => assertShellCommandAllowed('npm install foo; rm -rf /')).toThrow();
    expect(() => assertShellCommandAllowed('npm install foo && echo pwn')).toThrow();
  });
});
