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

  ipcMain.handle(
    "extensions:install",
    async (event, input: { extensionId: string; baseUrl: string }) => {
      const root = getWorkspaceRoot(event.sender.id);
      if (!root?.trim()) return { ok: false, error: "Deschide un folder de proiect." };
      if (!input?.extensionId || !input?.baseUrl) {
        return { ok: false, error: "extensionId și baseUrl sunt obligatorii." };
      }

      const base = input.baseUrl.replace(/\/$/, "");
      const downloadUrl = `${base}/api/extensions/${encodeURIComponent(input.extensionId)}/download`;
      let version: {
        version?: string;
        manifest?: Record<string, unknown>;
      };
      try {
        const res = await fetch(downloadUrl);
        if (!res.ok) {
          return {
            ok: false,
            error: `Marketplace indisponibil (${res.status}). Rulează npm run marketplace:serve.`,
          };
        }
        version = (await res.json()) as typeof version;
      } catch (cause: unknown) {
        const msg = cause instanceof Error ? cause.message : String(cause);
        return { ok: false, error: `Nu mă pot conecta la marketplace: ${msg}` };
      }

      const manifestRaw = version.manifest ?? {};
      const extId = input.extensionId;
      const extDir = path.join(root, ".cavalo", "extensions", extId);
      fs.mkdirSync(extDir, { recursive: true });

      const pkg = {
        ...manifestRaw,
        name: manifestRaw.name ?? extId.split(".").pop() ?? extId,
        publisher: manifestRaw.publisher ?? extId.split(".")[0] ?? "unknown",
        version: String(manifestRaw.version ?? version.version ?? "0.0.0"),
        engines: (manifestRaw.engines as ExtensionManifest["engines"]) ?? { caval: "^0.1.0" },
      };

      fs.writeFileSync(path.join(extDir, "package.json"), JSON.stringify(pkg, null, 2), "utf8");

      const manifest: ExtensionManifest = {
        id: extId,
        name: String(pkg.name),
        version: String(pkg.version),
        engines: pkg.engines ?? {},
      };
      extensionHost.register(manifest);
      return { ok: true, extension: manifest };
    }
  );
}

export { extensionHost };
