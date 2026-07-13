/** VS Code engine version CAVALLO reports to extensions. */
export const CAVALLO_VSCODE_ENGINE = '1.85.0';

/**
 * Minimal semver range check for VS Code engine strings (^1.80.0, >=1.70.0, 1.85.0).
 */
export function isVsCodeEngineCompatible(engineRange: string | undefined, runtime = CAVALLO_VSCODE_ENGINE): boolean {
  if (!engineRange?.trim()) return false;
  const range = engineRange.trim();

  if (range.startsWith('^')) {
    const base = range.slice(1);
    return compareSemver(runtime, base) >= 0 && sameMajor(runtime, base);
  }
  if (range.startsWith('>=')) {
    return compareSemver(runtime, range.slice(2).trim()) >= 0;
  }
  if (range.startsWith('>')) {
    return compareSemver(runtime, range.slice(1).trim()) > 0;
  }
  if (range.startsWith('<=')) {
    return compareSemver(runtime, range.slice(2).trim()) <= 0;
  }
  if (range.startsWith('<')) {
    return compareSemver(runtime, range.slice(1).trim()) < 0;
  }
  return compareSemver(runtime, range) >= 0;
}

function parseParts(v: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return [major, minor, patch];
}

function compareSemver(a: string, b: string): number {
  const [am, ai, ap] = parseParts(a);
  const [bm, bi, bp] = parseParts(b);
  if (am !== bm) return am - bm;
  if (ai !== bi) return ai - bi;
  return ap - bp;
}

function sameMajor(a: string, b: string): boolean {
  return parseParts(a)[0] === parseParts(b)[0];
}
