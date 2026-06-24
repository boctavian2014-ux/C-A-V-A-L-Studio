import { manualBillingSync } from "../../billing/sync/manual-sync";

export interface SyncTarget {
  endpoint: string;
  workspaceId: string;
}

export interface SyncPayload {
  settings: Record<string, unknown>;
  keybindings: Record<string, string>;
  extensions: string[];
}

export class SyncService {
  async push(target: SyncTarget, payload: SyncPayload): Promise<void> {
    void target;
    void payload;
    await manualBillingSync();
  }

  async pull(target: SyncTarget): Promise<Partial<SyncPayload>> {
    void target;
    await manualBillingSync();
    return {};
  }
}
