export type ProblemSeverity = 'error' | 'warning' | 'info';

export interface ProblemEntry {
  id: string;
  file: string;
  line: number;
  col: number;
  message: string;
  severity: ProblemSeverity;
  source?: string;
}

const TSC_LINE =
  /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(?:TS\d+:\s*)?(.+)$/i;
const ESLINT_LINE =
  /^(.+?):(\d+):(\d+):\s*(error|warning)\s+(.+)$/i;
const VITEST_FAIL =
  /^\s*(?:FAIL|×)\s+(.+?)(?:\s+›\s+(.+))?$/i;

let problemId = 0;

function nextId(): string {
  problemId += 1;
  return `problem-${problemId}`;
}

export function parseProblemsFromOutput(output: string, source = 'verify'): ProblemEntry[] {
  const problems: ProblemEntry[] = [];
  const seen = new Set<string>();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    let match = TSC_LINE.exec(line) ?? ESLINT_LINE.exec(line);
    if (match) {
      const [, file, lineStr, colStr, sev, message] = match;
      const key = `${file}:${lineStr}:${colStr}:${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({
        id: nextId(),
        file: file.trim(),
        line: Number(lineStr),
        col: Number(colStr),
        message: message.trim(),
        severity: sev.toLowerCase() as ProblemSeverity,
        source,
      });
      continue;
    }

    const vitest = VITEST_FAIL.exec(line);
    if (vitest) {
      const [, testName, fileHint] = vitest;
      const key = `vitest:${testName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({
        id: nextId(),
        file: fileHint?.trim() || '(test)',
        line: 1,
        col: 1,
        message: testName.trim(),
        severity: 'error',
        source: 'test',
      });
    }
  }

  return problems;
}

/** @internal */
export function resetProblemIdCounter(): void {
  problemId = 0;
}
