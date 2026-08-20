/**
 * Pas 7d.1 — IPC for workspace structure index status / snapshot (read-only).
 */

import { ipcMain } from "electron";

import { assertTrustedSender } from "../ipc-trust";
import type { BoundWorkspaceRootGetter } from "../bound-workspace";
import { requireBoundWorkspaceRoot } from "../bound-workspace";
import { workspaceIndexService } from "./workspace-index-service";

export function registerWorkspaceIndexHandlers(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter
): void {
  ipcMain.handle("caval:workspace-index-summary", async (event) => {
    assertTrustedSender(event);
    requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
    return { ok: true, summary: workspaceIndexService.getSummary() };
  });

  ipcMain.handle("caval:workspace-index-get", async (event) => {
    assertTrustedSender(event);
    requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
    return { ok: true, index: workspaceIndexService.getIndex() };
  });

  ipcMain.handle("caval:workspace-index-refresh", async (event) => {
    assertTrustedSender(event);
    requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
    const index = await workspaceIndexService.refreshFull();
    return { ok: true, index, summary: workspaceIndexService.getSummary() };
  });
}
