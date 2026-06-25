import { parentPort, workerData } from "node:worker_threads";

import type { PreloadHistoryRecord } from "./preload-cache";
import type { PreloadSignals, PreloadTarget } from "./preload-events";

export interface WorkerScoreRequest {
  type: "score-tasks";
  requestId: string;
  tasks: PreloadTarget[];
  signals: PreloadSignals;
  history: PreloadHistoryRecord[];
  adaptiveWeights: Record<string, number>;
}

export interface WorkerPredictRequest {
  type: "predict-priority";
  requestId: string;
  tasks: PreloadTarget[];
  maxConcurrent: number;
}

export interface WorkerShutdownRequest {
  type: "shutdown";
}

export type WorkerRequest = WorkerScoreRequest | WorkerPredictRequest | WorkerShutdownRequest;

export interface WorkerScoreResponse {
  type: "tasks-scored";
  requestId: string;
  tasks: PreloadTarget[];
}

export interface WorkerScheduleResponse {
  type: "schedule-ready";
  requestId: string;
  foreground: PreloadTarget[];
  background: PreloadTarget[];
}

export type WorkerResponse = WorkerScoreResponse | WorkerScheduleResponse | { type: "error"; requestId: string; message: string };

function scoreTask(
  task: PreloadTarget,
  signals: PreloadSignals,
  history: PreloadHistoryRecord[],
  adaptiveWeights: Record<string, number>
): number {
  let score = task.priority;
  score += (adaptiveWeights[task.modelId] ?? 1) * 15;

  const recentHits = history.filter((h) => h.modelId === task.modelId && h.hit).length;
  score += recentHits * 4;

  if (signals.selectedModel === task.modelId) score += 30;
  if (signals.pipelineNode === task.stage) score += 20;
  if (signals.activeFile && task.stage === "composer") score += 8;

  if (task.background) score -= 15;

  return Math.round(score);
}

function scheduleTasks(tasks: PreloadTarget[], maxConcurrent: number): { foreground: PreloadTarget[]; background: PreloadTarget[] } {
  const sorted = [...tasks].sort((a, b) => b.priority - a.priority);
  const foreground: PreloadTarget[] = [];
  const background: PreloadTarget[] = [];

  for (const task of sorted) {
    if (task.background) {
      background.push(task);
    } else if (foreground.length < maxConcurrent) {
      foreground.push(task);
    } else {
      background.push({ ...task, background: true });
    }
  }

  return { foreground, background };
}

if (parentPort) {
  parentPort.on("message", (message: WorkerRequest) => {
    try {
      if (message.type === "shutdown") {
        process.exit(0);
      }

      if (message.type === "score-tasks") {
        const scored = message.tasks
          .map((task) => ({
            ...task,
            priority: scoreTask(task, message.signals, message.history, message.adaptiveWeights),
          }))
          .sort((a, b) => b.priority - a.priority);

        const response: WorkerScoreResponse = {
          type: "tasks-scored",
          requestId: message.requestId,
          tasks: scored,
        };
        parentPort!.postMessage(response);
        return;
      }

      if (message.type === "predict-priority") {
        const scheduled = scheduleTasks(message.tasks, message.maxConcurrent);
        const response: WorkerScheduleResponse = {
          type: "schedule-ready",
          requestId: message.requestId,
          foreground: scheduled.foreground,
          background: scheduled.background,
        };
        parentPort!.postMessage(response);
      }
    } catch (error) {
      const response = {
        type: "error" as const,
        requestId: "requestId" in message ? message.requestId : "unknown",
        message: error instanceof Error ? error.message : String(error),
      };
      parentPort!.postMessage(response);
    }
  });

  parentPort.postMessage({ type: "worker.ready", workerId: workerData?.workerId ?? "preload" });
}
