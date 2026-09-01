import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";

import { tryResolveBundledWorkerPath } from "../../../src/main/resolve-worker-path";
import { compareTasks } from "./parallel-priority";
import type {
  ParallelSchedulerStats,
  ParallelTaskInput,
  ParallelTaskResult,
  ParallelWorkerRequest,
  ParallelWorkerResponse,
} from "./parallel-types";
import { PARALLEL_LOG_PREFIX } from "./parallel-types";
import { shutdownMark } from "../../../src/main/shutdown-diagnostics";

interface PendingTask {
  task: ParallelTaskInput;
  resolve: (result: ParallelTaskResult) => void;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
  currentRequestId?: string;
}

export class ParallelScheduler {
  private readonly workers: WorkerSlot[] = [];
  private readonly queue: PendingTask[] = [];
  private readonly pending = new Map<string, PendingTask>();
  private readonly cancelledTokens = new Set<string>();
  private inlineDraining = false;
  private closed = false;
  private completed = 0;
  private failed = 0;

  constructor(
    workerCount = Math.min(8, Math.max(4, Math.ceil((globalThis.navigator?.hardwareConcurrency ?? 4) / 2))),
    workerPath: string | null = tryResolveBundledWorkerPath("parallel-worker.js")
  ) {
    if (!workerPath) {
      return;
    }

    try {
      for (let index = 0; index < workerCount; index += 1) {
        this.workers.push(this.createWorker(workerPath, index));
      }
    } catch (error) {
      // Never block Electron window boot on a bad worker path (e.g. relative __dirname from webpack).
      console.error(
        `${PARALLEL_LOG_PREFIX} worker pool init failed (${workerPath}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  schedule(task: ParallelTaskInput): Promise<ParallelTaskResult> {
    if (task.tokenId && this.cancelledTokens.has(task.tokenId)) {
      return Promise.resolve({
        taskId: task.taskId,
        type: task.type,
        status: "cancelled",
        durationMs: 0,
      });
    }

    return new Promise((resolve) => {
      this.queue.push({ task, resolve });
      this.queue.sort((a, b) => compareTasks(a.task, b.task));
      console.log(`${PARALLEL_LOG_PREFIX} queued ${task.type} ${task.relativePath ?? task.filePath ?? task.taskId}`);
      this.drain();
    });
  }

  cancel(tokenId: string): void {
    this.cancelledTokens.add(tokenId);
  }

  stats(): ParallelSchedulerStats {
    return {
      queued: this.queue.length,
      running: this.pending.size,
      workers: this.workers.length,
      completed: this.completed,
      failed: this.failed,
    };
  }

  async shutdown(): Promise<void> {
    await this.dispose();
  }

  async dispose(): Promise<void> {
    if (this.closed) {
      shutdownMark("parallel-workers-already-stopped");
      return;
    }
    this.closed = true;
    shutdownMark("parallel-workers-stop", { workers: this.workers.length });
    await Promise.all(this.workers.map((slot) => slot.worker.terminate().catch(() => 0)));
    this.workers.length = 0;
    this.queue.length = 0;
    this.pending.clear();
    this.inlineDraining = false;
  }

  private createWorker(workerPath: string, index: number): WorkerSlot {
    const worker = new Worker(workerPath, { workerData: { index } });
    const slot: WorkerSlot = { worker, busy: false };

    worker.on("message", (response: ParallelWorkerResponse) => {
      const pending = this.pending.get(response.requestId);
      if (!pending) return;
      this.pending.delete(response.requestId);
      slot.busy = false;
      slot.currentRequestId = undefined;

      if (response.result.status === "failed") this.failed += 1;
      else this.completed += 1;

      console.log(`${PARALLEL_LOG_PREFIX} done ${response.result.type} ${response.result.status}`);
      pending.resolve(response.result);
      this.drain();
    });

    worker.on("error", (error: Error) => {
      console.warn(`${PARALLEL_LOG_PREFIX} worker error: ${error.message}`);
      slot.busy = false;
      slot.currentRequestId = undefined;
      this.failed += 1;
      this.drain();
    });

    return slot;
  }

  private drain(): void {
    if (this.workers.length === 0) {
      void this.drainInline();
      return;
    }

    for (const slot of this.workers) {
      if (slot.busy) continue;
      const next = this.nextTask();
      if (!next) return;

      const requestId = randomUUID();
      const request: ParallelWorkerRequest = { requestId, task: next.task };
      slot.busy = true;
      slot.currentRequestId = requestId;
      this.pending.set(requestId, next);
      slot.worker.postMessage(request);
    }
  }

  private async drainInline(): Promise<void> {
    if (this.inlineDraining) return;
    this.inlineDraining = true;

    try {
      while (this.queue.length > 0) {
        const next = this.nextTask();
        if (!next) break;
        const result = this.runInlineTask(next.task);
        if (result.status === "failed") this.failed += 1;
        else this.completed += 1;
        next.resolve(result);
      }
    } finally {
      this.inlineDraining = false;
    }
  }

  private runInlineTask(task: ParallelTaskInput): ParallelTaskResult {
    return {
      taskId: task.taskId,
      type: task.type,
      status: "failed",
      durationMs: 0,
      error: "Parallel worker bundle unavailable",
    };
  }

  private nextTask(): PendingTask | undefined {
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) return undefined;
      if (next.task.tokenId && this.cancelledTokens.has(next.task.tokenId)) {
        next.resolve({
          taskId: next.task.taskId,
          type: next.task.type,
          status: "cancelled",
          durationMs: 0,
        });
        continue;
      }
      return next;
    }
    return undefined;
  }
}

export const parallelScheduler = new ParallelScheduler();
