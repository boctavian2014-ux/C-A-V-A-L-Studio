export interface DevRuntimeBuildStatus {
  isDev: boolean;
  runningHash: string;
  latestHash: string;
  needsRestart: boolean;
}

export const DEV_RESTART_TOAST =
  "Main process updated. Restart CAVAL to use the latest IPC and execution gates.";

export function shouldNotifyRuntimeRestart(
  status: DevRuntimeBuildStatus | null | undefined,
  lastSeenHash: string | null | undefined
): boolean {
  if (!status?.isDev) return false;
  if (!status.needsRestart) return false;
  if (!status.latestHash.trim()) return false;
  return status.latestHash !== (lastSeenHash ?? "");
}
