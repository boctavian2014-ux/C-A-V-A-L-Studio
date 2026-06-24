export interface RetryJob<T = unknown> {
  id: string;
  type: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
  nextRunAt: number;
  lastError?: string;
}

export class UniversalRetryQueue {
  private readonly jobs = new Map<string, RetryJob>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly handler: (job: RetryJob) => Promise<void>,
    private readonly pollIntervalMs = 5_000
  ) {}

  enqueue<T>(type: string, payload: T, maxAttempts = 5): RetryJob<T> {
    const job: RetryJob<T> = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      attempts: 0,
      maxAttempts,
      nextRunAt: Date.now()
    };
    this.jobs.set(job.id, job as RetryJob);
    this.start();
    return job;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (job.nextRunAt > now) continue;
      job.attempts += 1;
      try {
        await this.handler(job);
        this.jobs.delete(job.id);
      } catch (error) {
        job.lastError = error instanceof Error ? error.message : String(error);
        if (job.attempts >= job.maxAttempts) {
          this.jobs.delete(job.id);
          continue;
        }
        job.nextRunAt = now + Math.min(60_000, 2 ** job.attempts * 1000);
      }
    }
  }

  pendingCount(): number {
    return this.jobs.size;
  }
}
