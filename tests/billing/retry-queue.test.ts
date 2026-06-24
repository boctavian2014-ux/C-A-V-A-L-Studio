import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UniversalRetryQueue } from "../../billing/retry-queue";

describe("UniversalRetryQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes successful jobs and removes them", async () => {
    const handled: string[] = [];
    const queue = new UniversalRetryQueue(async (job) => {
      handled.push(String(job.payload));
    }, 100);

    queue.enqueue("billing.sync", "payload-1", 3);
    expect(queue.pendingCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(handled).toEqual(["payload-1"]);
    expect(queue.pendingCount()).toBe(0);
    queue.stop();
  });

  it("retries failed jobs until maxAttempts", async () => {
    let attempts = 0;
    const queue = new UniversalRetryQueue(async () => {
      attempts += 1;
      throw new Error("temporary failure");
    }, 50);

    queue.enqueue("billing.retry", "x", 2);
    await vi.advanceTimersByTimeAsync(50);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(attempts).toBe(2);
    expect(queue.pendingCount()).toBe(0);
    queue.stop();
  });
});
