/**
 * Pas 7d.2 — IPC for lexical search over the workspace structure index.
 * Read-only: never writes the index; queries the in-memory snapshot.
 */

import { ipcMain } from "electron";

import { assertTrustedSender } from "../ipc-trust";
import type { BoundWorkspaceRootGetter } from "../bound-workspace";
import { requireBoundWorkspaceRoot } from "../bound-workspace";
import type { WorkspaceSearchQuery, WorkspaceSearchResponse } from "../../shared/workspace-search-contract";
import { workspaceIndexService } from "./workspace-index-service";
import {
  INDEX_UNAVAILABLE_MESSAGE,
  isWorkspaceIndexReady,
  searchIndex,
} from "./workspace-search";

export function registerWorkspaceSearchHandlers(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter
): void {
  ipcMain.handle(
    "caval:workspace-search-query",
    async (event, query: WorkspaceSearchQuery): Promise<WorkspaceSearchResponse> => {
      assertTrustedSender(event);
      try {
        requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      } catch (err) {
        return {
          ok: false,
          results: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (!query || typeof query !== "object" || typeof query.text !== "string") {
        return { ok: false, results: [], error: "Invalid search query" };
      }

      const index = workspaceIndexService.getIndex();
      if (!isWorkspaceIndexReady(index)) {
        return { ok: false, results: [], error: INDEX_UNAVAILABLE_MESSAGE };
      }

      return { ok: true, results: searchIndex(index, query) };
    }
  );
}
