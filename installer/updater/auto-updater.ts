import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
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
        message: `Caval Studio ${info.version} is available.`,
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
        detail: "Restart Caval Studio to apply the update."
      });
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
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
