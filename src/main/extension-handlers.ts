import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";

import { CavalExtensionHost, type ExtensionManifest } from "../extensions/extension-host";

const extensionHost = new CavalExtensionHost();

function loadExtensionsFromDisk(workspaceRoot: string): void {
  const extDir = path.join(workspaceRoot, ".cavalo", "extensions");
  if (!fs.existsSync(extDir)) return;

  for (const entry of fs.readdirSync(extDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(extDir, entry.name, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const raw = fs.readFileSync(manifestPath, "utf8");
      const pkg = JSON.parse(raw) as {
        name?: string;
        version?: string;
        engines?: { vscode?: string; caval?: string };
      };
      const manifest: ExtensionManifest = {
        id: entry.name,
        name: pkg.name ?? entry.name,
        version: pkg.version ?? "0.0.0",
        engines: pkg.engines ?? {},
      };
      extensionHost.register(manifest);
    } catch {
      /* skip invalid manifests */
    }
  }
}

export function registerExtensionHandlers(getWorkspaceRoot: (senderId: number) => string): void {
  ipcMain.handle("extensions:list", async (event) => {
    const root = getWorkspaceRoot(event.sender.id);
    if (root?.trim()) loadExtensionsFromDisk(root);
    return { ok: true, extensions: extensionHost.list() };
  });

  ipcMain.handle("extensions:register", async (_event, manifest: ExtensionManifest) => {
    if (!manifest?.id) return { ok: false, error: "Invalid manifest" };
    extensionHost.register(manifest);
    return { ok: true };
  });
}

export { extensionHost };
