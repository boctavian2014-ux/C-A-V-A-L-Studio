import { ipcMain, type WebContents } from "electron";

import { preloadEventBus, type PreloadEvent } from "../../ai/preload/preload-events";
import { preloadManager, type PreloadStatus } from "../../ai/preload/preload-manager";
import type { PreloadStage } from "../../ai/preload/preload-events";
import type { RoutingIntent, ModelCapability } from "../../ai/types";

const subscribers = new Map<number, () => void>();

function subscribePreloadIpc(sender: WebContents): () => void {
  const listener = (event: PreloadEvent) => {
    sender.send("caval:preload-event", event);
  };
  const unsub = preloadEventBus.on(listener);
  subscribers.set(sender.id, unsub);
  return unsub;
}

export function registerPreloadHandlers(getWorkspaceRoot: (senderId: number) => string): void {
  ipcMain.handle("caval:preload-status", (): PreloadStatus => {
    return preloadManager.getStatus();
  });

  ipcMain.handle("caval:preload-warm", async (_event, input: { modelId: string; stage?: PreloadStage }) => {
    const ok = await preloadManager.warmModel(input.modelId, input.stage ?? "chat");
    return { ok };
  });

  ipcMain.handle("caval:preload-invalidate", async () => {
    preloadManager.setEnabled(false);
    preloadManager.setEnabled(true);
    return { ok: true };
  });

  ipcMain.handle(
    "caval:preload-notify",
    async (
      event,
      input: {
        action: string;
        openFiles?: string[];
        activeFile?: string;
        modelId?: string;
        intent?: RoutingIntent;
        capability?: ModelCapability;
      }
    ) => {
      const root = getWorkspaceRoot(event.sender.id);
      preloadManager.configure({ workspaceRoot: root });

      if (input.openFiles) {
        preloadManager.onFilesChanged(input.openFiles, input.activeFile);
      }

      if (input.modelId) {
        preloadManager.onModelSelected(input.modelId, input.intent, input.capability);
      }

      preloadManager.onUserAction(input.action, {
        workspaceRoot: root,
        openFiles: input.openFiles,
        activeFile: input.activeFile,
        selectedModel: input.modelId,
      });

      return { ok: true };
    }
  );

  ipcMain.on("caval:preload-subscribe", (event) => {
    subscribers.get(event.sender.id)?.();
    subscribePreloadIpc(event.sender);
  });

  ipcMain.on("caval:preload-unsubscribe", (event) => {
    subscribers.get(event.sender.id)?.();
    subscribers.delete(event.sender.id);
  });
}

export { preloadManager };
