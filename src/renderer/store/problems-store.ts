import { create } from 'zustand';
import type { ProblemEntry } from './parse-problems';

interface ProblemsStore {
  problems: ProblemEntry[];
  focusedIndex: number;
  setProblems: (problems: ProblemEntry[]) => void;
  mergeProblems: (problems: ProblemEntry[], source?: string) => void;
  clearProblems: () => void;
  focusNext: () => ProblemEntry | null;
  focusPrevious: () => ProblemEntry | null;
  getFocused: () => ProblemEntry | null;
  errorCount: () => number;
  warningCount: () => number;
}

export const useProblemsStore = create<ProblemsStore>((set, get) => ({
  problems: [],
  focusedIndex: -1,

  setProblems: (problems) => set({ problems, focusedIndex: problems.length ? 0 : -1 }),

  mergeProblems: (incoming, source) => {
    set((state) => {
      const kept = source
        ? state.problems.filter((p) => p.source !== source)
        : [];
      const problems = [...kept, ...incoming];
      return {
        problems,
        focusedIndex: problems.length ? Math.min(state.focusedIndex, problems.length - 1) : -1,
      };
    });
  },

  clearProblems: () => set({ problems: [], focusedIndex: -1 }),

  focusNext: () => {
    const { problems, focusedIndex } = get();
    if (!problems.length) return null;
    const next = focusedIndex < 0 ? 0 : (focusedIndex + 1) % problems.length;
    set({ focusedIndex: next });
    return problems[next] ?? null;
  },

  focusPrevious: () => {
    const { problems, focusedIndex } = get();
    if (!problems.length) return null;
    const prev = focusedIndex <= 0 ? problems.length - 1 : focusedIndex - 1;
    set({ focusedIndex: prev });
    return problems[prev] ?? null;
  },

  getFocused: () => {
    const { problems, focusedIndex } = get();
    return focusedIndex >= 0 ? problems[focusedIndex] ?? null : null;
  },

  errorCount: () => get().problems.filter((p) => p.severity === 'error').length,

  warningCount: () => get().problems.filter((p) => p.severity === 'warning').length,
}));

export function formatProblemForChat(problem: ProblemEntry): string {
  return [
    'Fixează această problemă din proiect:',
    '',
    `${problem.file}:${problem.line}:${problem.col} [${problem.severity}] ${problem.message}`,
  ].join('\n');
}

export function formatProblemsForChat(problems: ProblemEntry[]): string {
  if (!problems.length) return '';
  const lines = problems.map(
    (p, i) => `${i + 1}. ${p.file}:${p.line}:${p.col} [${p.severity}] ${p.message}`
  );
  return [
    'Fixează următoarele probleme detectate în proiect:',
    '',
    ...lines,
  ].join('\n');
}

export function revealProblem(problem: ProblemEntry, projectPath: string | null): void {
  let filePath = problem.file;
  if (projectPath && !/^[a-zA-Z]:[\\/]/.test(filePath) && !filePath.startsWith('/')) {
    filePath = `${projectPath.replace(/[/\\]+$/, '')}/${filePath.replace(/^[/\\]+/, '')}`;
  }
  document.dispatchEvent(
    new CustomEvent('caval:reveal-line', {
      detail: { path: filePath, line: problem.line, col: problem.col },
    })
  );
}
