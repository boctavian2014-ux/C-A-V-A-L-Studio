import fs from "node:fs";
import path from "node:path";

export interface ModuleCoverageGap {
  sourceFile: string;
  category: string;
  hasTest: boolean;
  testFile?: string;
  exportCount: number;
}

export interface CoverageScanResult {
  scannedAt: string;
  totalSourceFiles: number;
  testedFiles: number;
  untestedFiles: number;
  coveragePercent: number;
  gaps: ModuleCoverageGap[];
  byCategory: Record<string, { total: number; tested: number }>;
}

const SCAN_ROOTS = [
  "ai",
  "billing",
  "context-engine",
  "marketplace",
  "mobile",
  "mobile-app",
  "src/main",
  "romania",
  "components",
  ".cicd",
] as const;

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", ".caval"]);
const SKIP_FILES = /\.(test|spec|d)\.ts$/;
const SKIP_PATTERNS = [/types\.ts$/, /index\.ts$/, /electron-main\.ts$/, /preload\.ts$/];

function categoryFor(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("ai/")) return "ai";
  if (normalized.startsWith("billing/")) return "billing";
  if (normalized.startsWith("context-engine/")) return "ai";
  if (normalized.startsWith("marketplace/")) return "backend";
  if (normalized.startsWith("mobile/")) return "mobile";
  if (normalized.startsWith("mobile-app/")) return "mobile";
  if (normalized.startsWith("src/main/")) return "backend";
  if (normalized.startsWith("components/")) return "ai";
  if (normalized.startsWith(".cicd/")) return "ci";
  if (normalized.startsWith("romania/")) return "utils";
  return "utils";
}

function countExports(content: string): number {
  const matches = content.match(/^\s*export\s+(async\s+)?(function|class|const|interface|type|enum)\s+/gm);
  return matches?.length ?? 0;
}

function walk(dir: string, root: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, files);
    else if (entry.name.endsWith(".ts") && !SKIP_FILES.test(entry.name)) {
      const rel = path.relative(root, full).replace(/\\/g, "/");
      if (!SKIP_PATTERNS.some((p) => p.test(rel))) files.push(rel);
    }
  }
  return files;
}

function findTestFile(sourceFile: string, root: string): string | undefined {
  const base = path.basename(sourceFile, ".ts");
  const candidates = [
    `tests/${sourceFile.replace(/\.ts$/, ".test.ts")}`,
    `tests/ai/${base}.test.ts`,
    `tests/backend/${base}.test.ts`,
    `tests/billing/${base}.test.ts`,
    `tests/mobile/${base}.test.ts`,
    `tests/security/${base}.test.ts`,
    `tests/supabase/${base}.test.ts`,
    `tests/ci/${base}.test.ts`,
    `tests/utils/${base}.test.ts`,
    `tests/main/${base}.test.ts`,
    `tests/models/${base}.test.ts`,
    `tests/preload/${base}.test.ts`,
    `tests/engineering/${base}.test.ts`,
    sourceFile.replace(/\.ts$/, ".test.ts"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(root, candidate))) return candidate;
  }

  const testsDir = path.join(root, "tests");
  if (!fs.existsSync(testsDir)) return undefined;
  for (const testFile of walk(testsDir, root)) {
    if (testFile.endsWith(`${base}.test.ts`)) return testFile;
  }
  return undefined;
}

export function scanProjectCoverage(rootDir: string): CoverageScanResult {
  const sourceFiles: string[] = [];
  for (const scanRoot of SCAN_ROOTS) {
    walk(path.join(rootDir, scanRoot), rootDir, sourceFiles);
  }

  const gaps: ModuleCoverageGap[] = sourceFiles.map((sourceFile) => {
    const fullPath = path.join(rootDir, sourceFile);
    const content = fs.readFileSync(fullPath, "utf8");
    const testFile = findTestFile(sourceFile, rootDir);
    return {
      sourceFile,
      category: categoryFor(sourceFile),
      hasTest: Boolean(testFile),
      testFile,
      exportCount: countExports(content),
    };
  });

  const tested = gaps.filter((g) => g.hasTest).length;
  const byCategory: Record<string, { total: number; tested: number }> = {};

  for (const gap of gaps) {
    byCategory[gap.category] ??= { total: 0, tested: 0 };
    byCategory[gap.category].total += 1;
    if (gap.hasTest) byCategory[gap.category].tested += 1;
  }

  return {
    scannedAt: new Date().toISOString(),
    totalSourceFiles: gaps.length,
    testedFiles: tested,
    untestedFiles: gaps.length - tested,
    coveragePercent: gaps.length === 0 ? 100 : Math.round((tested / gaps.length) * 1000) / 10,
    gaps,
    byCategory,
  };
}

export function formatCoverageReport(result: CoverageScanResult): string {
  const lines = [
    `# Full Test Coverage Engine Report`,
    ``,
    `Scanned: ${result.scannedAt}`,
    `Source files: ${result.totalSourceFiles}`,
    `With tests: ${result.testedFiles}`,
    `Without tests: ${result.untestedFiles}`,
    `File-level coverage: ${result.coveragePercent}%`,
    ``,
    `## By category`,
  ];

  for (const [cat, stats] of Object.entries(result.byCategory).sort((a, b) => a[0].localeCompare(b[0]))) {
    const pct = stats.total === 0 ? 100 : Math.round((stats.tested / stats.total) * 100);
    lines.push(`- ${cat}: ${stats.tested}/${stats.total} (${pct}%)`);
  }

  const untested = result.gaps.filter((g) => !g.hasTest).slice(0, 40);
  if (untested.length > 0) {
    lines.push(``, `## Top untested modules (first 40)`);
    for (const gap of untested) {
      lines.push(`- [${gap.category}] ${gap.sourceFile} (${gap.exportCount} exports)`);
    }
  }

  return lines.join("\n");
}
