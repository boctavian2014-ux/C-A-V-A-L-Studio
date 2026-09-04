import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

import { prepareQuitForUpdate } from "../../src/main/app-shutdown";
import type { ReleaseChannel } from "./release-feed";

export interface AutoUpdateOptions {
  channel: ReleaseChannel;
  feedUrl?: string;
  allowPrerelease?: boolean;
}

export class CavalAutoUpdater {
  constructor(private readonly options: AutoUpdateOptions) {
    autoUpdater.channel = options.channel;
    autoUpdater.allowPrerelease = options.allowPrerelease ?? options.channel !== "stable";
    autoUpdater.autoDownload = false;
    if (options.feedUrl) {
      autoUpdater.setFeedURL({ provider: "generic", url: options.feedUrl });
    }
  }

  wireEvents(): void {
    autoUpdater.on("update-available", async (info) => {
      const result = await dialog.showMessageBox({
        type: "info",
        buttons: ["Download", "Later"],
        defaultId: 0,
        message: `CAVALLO Studio ${info.version} is available.`,
        detail: "Download the update now?"
      });
      if (result.response === 0) {
        await autoUpdater.downloadUpdate();
      }
    });

    autoUpdater.on("update-downloaded", async () => {
      const result = await dialog.showMessageBox({
        type: "info",
        buttons: ["Restart", "Later"],
        defaultId: 0,
        message: "Update downloaded.",
        detail: "Restart CAVALLO Studio to apply the update."
      });
      if (result.response === 0) {
        await safeQuitAndInstall();
      }
    });
  }

  check(): Promise<unknown> {
    if (!app.isPackaged) {
      return Promise.resolve({ skipped: true, reason: "App is not packaged." });
    }

    return autoUpdater.checkForUpdates();
  }
}

/**
 * Teardown MCP/LSP/SQLite/Ollama first, open the quit gate, then hand off to NSIS.
 * Calling quitAndInstall while before-quit still preventDefault-s blocks the installer.
 */
export async function safeQuitAndInstall(): Promise<void> {
  await prepareQuitForUpdate();
  autoUpdater.quitAndInstall();
}
