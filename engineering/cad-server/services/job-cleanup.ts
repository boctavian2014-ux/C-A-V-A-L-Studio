import { cleanupExpiredCadJobs } from "../storage/index";
import { cadLog } from "../middleware/logger";

const CLEANUP_INTERVAL_MS = Number(process.env.CAD_CLEANUP_INTERVAL_MS ?? 600_000);

let timer: ReturnType<typeof setInterval> | null = null;

export const startCadJobCleanup = (): void => {
  if (timer) return;
  timer = setInterval(() => {
    void cleanupExpiredCadJobs().then((removed) => {
      if (removed > 0) {
        cadLog({ level: "info", event: "jobs_cleaned", meta: { removed } });
      }
    });
  }, CLEANUP_INTERVAL_MS);
};

export const stopCadJobCleanup = (): void => {
  if (timer) clearInterval(timer);
  timer = null;
};

export const resetCadJobCleanupForTests = (): void => {
  stopCadJobCleanup();
};
