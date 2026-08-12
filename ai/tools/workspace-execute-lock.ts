import { normalizeWorkspaceRoot } from "../../src/main/path-security";

/**
 * Per-workspace exclusive lock — same pattern as Project Health `executeInFlightByRoot`.
 * Zone B automated runners and mutating git ops reuse this helper (not a parallel design).
 */
export function createPerRootMutex(busyMessage: string) {
  const inFlightByRoot = new Map<string, Promise<unknown>>();

  return {
    async runExclusive<T>(workspaceRoot: string, job: () => Promise<T>): Promise<T> {
      const lockKey = normalizeWorkspaceRoot(workspaceRoot);
      if (inFlightByRoot.has(lockKey)) {
        throw new Error(busyMessage);
      }
      const pending = job();
      inFlightByRoot.set(lockKey, pending);
      try {
        return await pending;
      } finally {
        inFlightByRoot.delete(lockKey);
      }
    },

    isInFlight(workspaceRoot: string): boolean {
      return inFlightByRoot.has(normalizeWorkspaceRoot(workspaceRoot));
    },

    /** @internal test helper */
    clear(): void {
      inFlightByRoot.clear();
    },
  };
}

/** Automated shell / Project Health / sandbox / mobile-fix exclusive per workspace. */
export const workspaceCommandMutex = createPerRootMutex(
  "Workspace command already in progress for this workspace"
);

/** Mutating git IPC exclusive per workspace. */
export const workspaceGitMutex = createPerRootMutex(
  "Git operation already in progress for this workspace"
);

/** Local CAD install / render exclusive per workspace key (or global install key). */
export const workspaceCadMutex = createPerRootMutex(
  "CAD local job already in progress"
);
