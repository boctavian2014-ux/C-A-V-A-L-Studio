import type { ParallelPriority, ParallelTaskInput, ParallelTaskType } from "./parallel-types";

const PRIORITY_SCORE: Record<ParallelPriority, number> = {
  HIGH: 300,
  MEDIUM: 200,
  LOW: 100,
};

const TYPE_WEIGHT: Record<ParallelTaskType, number> = {
  file: 50,
  symbols: 40,
  dependencies: 35,
  embedding: 30,
  semantic: 20,
};

export function priorityScore(priority: ParallelPriority): number {
  return PRIORITY_SCORE[priority];
}

export function taskScore(task: ParallelTaskInput): number {
  const ageBoost = Math.min(50, Math.floor((Date.now() - task.createdAt) / 1000));
  const batchPenalty = (task.batchIndex ?? 0) * 2;
  return priorityScore(task.priority) + TYPE_WEIGHT[task.type] + ageBoost - batchPenalty;
}

export function compareTasks(a: ParallelTaskInput, b: ParallelTaskInput): number {
  return taskScore(b) - taskScore(a);
}

export function priorityForFile(filePath: string, activeFile?: string): ParallelPriority {
  if (activeFile && filePath === activeFile) return "HIGH";
  if (/\.(ts|tsx|js|jsx|py|go|rs)$/i.test(filePath)) return "MEDIUM";
  return "LOW";
}
