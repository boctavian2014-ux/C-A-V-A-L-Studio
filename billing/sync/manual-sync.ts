import { periodicBillingSync, type SyncResult } from "./periodic-sync";

export const manualBillingSync = async (
  fetchRemote?: () => Promise<unknown>
): Promise<SyncResult> => periodicBillingSync(fetchRemote);
