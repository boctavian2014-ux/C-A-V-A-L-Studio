import { listSubscriptions } from "../revenuecat/update-subscription";

export interface SyncResult {
  syncedAt: string;
  subscriptionCount: number;
  ok: boolean;
  error?: string;
}

export const periodicBillingSync = async (
  fetchRemote?: () => Promise<unknown>
): Promise<SyncResult> => {
  try {
    if (fetchRemote) {
      await fetchRemote();
    }
    return {
      syncedAt: new Date().toISOString(),
      subscriptionCount: listSubscriptions().length,
      ok: true
    };
  } catch (error) {
    return {
      syncedAt: new Date().toISOString(),
      subscriptionCount: listSubscriptions().length,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

let periodicTimer: NodeJS.Timeout | null = null;

export const startPeriodicBillingSync = (
  intervalMs = Number(process.env.BILLING_SYNC_INTERVAL_MS ?? 3_600_000),
  fetchRemote?: () => Promise<unknown>
): void => {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    void periodicBillingSync(fetchRemote);
  }, intervalMs);
};

export const stopPeriodicBillingSync = (): void => {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
};
