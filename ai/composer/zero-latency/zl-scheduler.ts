import { randomUUID } from "node:crypto";

import type { ZLPriority, ZLScheduledTask } from "./zl-types";
import { ZL_LOG_PREFIX } from "./zl-types";

const PRIORITY: Record<ZLPriority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export class ZLScheduler {
  private readonly queue: ZLScheduledTask[] = [];
  private readonly cancelled = new Set<string>();
  private running = 0;

  constructor(private readonly maxConcurrent = 3) {}

  createToken(): string {
    return randomUUID();
  }

  cancel(tokenId: string): void {
    this.cancelled.add(tokenId);
  }

  schedule(task: Omit<ZLScheduledTask, "id">): string {
    const id = randomUUID();
    this.queue.push({ id, ...task });
    this.queue.sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority]);
    console.log(`${ZL_LOG_PREFIX} queued ${task.type} (${task.priority})`);
    void this.drain();
    return id;
  }

  stats(): { queued: number; running: number } {
    return { queued: this.queue.length, running: this.running };
  }

  private async drain(): Promise<void> {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;
      if (task.tokenId && this.cancelled.has(task.tokenId)) continue;
      this.running += 1;
      void (async () => {
        if (task.tokenId && this.cancelled.has(task.tokenId)) return;
        await task
          .run()
          .catch((error) => console.warn(`${ZL_LOG_PREFIX} ${task.type} failed: ${error instanceof Error ? error.message : String(error)}`));
      })()
        .finally(() => {
          this.running = Math.max(0, this.running - 1);
          void this.drain();
        });
    }
  }
}

export const zlScheduler = new ZLScheduler();
