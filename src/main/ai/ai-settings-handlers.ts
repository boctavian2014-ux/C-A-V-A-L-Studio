/**
 * Pas 7e.3 — IPC for per-workspace AI settings.
 */

import { ipcMain } from "electron";

import type { AiSettings } from "../../shared/ai-settings-contract";
import { assertTrustedSender } from "../ipc-trust";
import type { BoundWorkspaceRootGetter } from "../bound-workspace";
import { requireBoundWorkspaceRoot } from "../bound-workspace";
import {
  loadAiSettingsSync,
  resetAiSettingsSync,
  updateAiSettingsSync,
} from "./ai-settings";

export function registerAiSettingsHandlers(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter
): void {
  ipcMain.handle("caval:ai-settings-get", async (event) => {
    assertTrustedSender(event);
    const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
    return { ok: true, settings: loadAiSettingsSync(root) };
  });

  ipcMain.handle(
    "caval:ai-settings-update",
    async (event, input: { partial?: Partial<AiSettings> }) => {
      assertTrustedSender(event);
      const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      const partial = input?.partial;
      if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
        return { ok: false, error: "Missing partial settings" };
      }
      const settings = updateAiSettingsSync(root, partial);
      return { ok: true, settings };
    }
  );

  ipcMain.handle("caval:ai-settings-reset", async (event) => {
    assertTrustedSender(event);
    const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
    const settings = resetAiSettingsSync(root);
    return { ok: true, settings };
  });
}
