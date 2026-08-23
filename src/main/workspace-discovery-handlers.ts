import { ipcMain } from "electron";

import { inspectWorkspaceDiscovery } from "../../ai/workspace/workspace-discovery-inspect";
import type { WorkspaceDiscoverySnapshot } from "../shared/workspace-discovery-contract";
import {
  requireBoundWorkspaceRootFromEvent,
  type BoundWorkspaceRootGetter,
} from "./bound-workspace";
import { assertTrustedSender } from "./ipc-trust";

export function registerWorkspaceDiscoveryHandlers(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter
): void {
  ipcMain.handle(
    "caval:workspace-discover",
    async (event, options?: { runVerify?: boolean }): Promise<WorkspaceDiscoverySnapshot> => {
      try {
        assertTrustedSender(event);
        const root = requireBoundWorkspaceRootFromEvent(
          event,
          getBoundWorkspaceRoot,
          "Nu este deschis niciun folder de proiect. Alege un folder sau creează un proiect."
        );
        return await inspectWorkspaceDiscovery(root, {
          runVerify: options?.runVerify !== false,
        });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          projectName: "",
          projectType: "unknown",
          hasPackageJson: false,
          hasReadme: false,
          rootEntries: [],
          keyDirs: [],
          scripts: {},
          todos: [],
          recommendedNextStep: "Deschide un folder de proiect valid.",
        };
      }
    }
  );
}
