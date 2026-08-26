import type { IpcMainInvokeEvent, WebContents } from "electron";
import { ipcMain } from "electron";

import { safeErrorMessageForUi } from "../../ai/providers/provider-errors";
import {
  resolveBindableWorkspaceDirectory,
  type BoundWorkspaceRootGetter,
} from "./bound-workspace";
import { assertTrustedSender } from "./ipc-trust";
import { pathsEqual } from "./path-security";
import type { RecentWorkspaceSource } from "./recent-workspaces";

export function registerWorkspaceBindingHandlers(opts: {
  bindWorkspace: (senderId: number, root: string) => void;
  getBoundRoot: BoundWorkspaceRootGetter;
  addRecentWorkspace: (root: string, source: RecentWorkspaceSource) => void;
  onOpen: (
    senderId: number,
    sender: WebContents,
    root: string,
    source: RecentWorkspaceSource
  ) => Promise<void>;
  /** Same bound root (e.g. renderer reload) — re-send folder-opened without session reset. */
  onCachedOpen?: (
    senderId: number,
    sender: WebContents,
    root: string,
    source: RecentWorkspaceSource
  ) => Promise<void>;
}): void {
  ipcMain.handle(
    "caval:workspace-open",
    async (
      event: IpcMainInvokeEvent,
      folderPath: unknown,
      options?: { source?: RecentWorkspaceSource }
    ) => {
      try {
        assertTrustedSender(event);
        const root = resolveBindableWorkspaceDirectory(folderPath);
        const source = options?.source === "clone" ? "clone" : "folder";
        const current = opts.getBoundRoot(event.sender.id);
        if (current && pathsEqual(current, root)) {
          opts.bindWorkspace(event.sender.id, root);
          opts.addRecentWorkspace(root, source);
          await opts.onCachedOpen?.(event.sender.id, event.sender, root, source);
          return { ok: true, path: root, cached: true };
        }
        await opts.onOpen(event.sender.id, event.sender, root, source);
        return { ok: true, path: root };
      } catch (error) {
        return { ok: false, error: safeErrorMessageForUi(error) };
      }
    }
  );

  ipcMain.handle("caval:workspace-sync", (event: IpcMainInvokeEvent, folderPath: unknown) => {
    try {
      assertTrustedSender(event);
      const root = resolveBindableWorkspaceDirectory(folderPath);
      opts.bindWorkspace(event.sender.id, root);
      return { ok: true, path: root };
    } catch (error) {
      return { ok: false, error: safeErrorMessageForUi(error) };
    }
  });
}
