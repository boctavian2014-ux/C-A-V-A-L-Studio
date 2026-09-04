import { app } from "electron";

import { CavalAutoUpdater } from "../../installer/updater/auto-updater";

/** Packaged builds only. Dev, `electron .`, and CAVAL_SMOKE must not hit the GitHub feed. */
export function wirePackagedAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }
  const updater = new CavalAutoUpdater({ channel: "stable" });
  updater.wireEvents();
  void updater.check();
}
