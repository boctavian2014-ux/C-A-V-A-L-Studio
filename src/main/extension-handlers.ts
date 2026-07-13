import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import AdmZip from "adm-zip";

import { ExtensionCompatibility } from "../../marketplace/extensions/compatibility";
import type { ExtensionManifest as MarketplaceExtensionManifest } from "../../marketplace/extensions/manifest-validator";
import { CavalExtensionHost, type ExtensionManifest } from "../extensions/extension-host";
import { downloadOpenVsxVsix, listPopularOpenVsx, searchOpenVsx } from "./open-vsx-client";

const extensionHost = new CavalExtensionHost();
const compatibility = new ExtensionCompatibility();

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

function extractVsixToDirectory(vsixBuffer: Buffer, targetDir: string): void {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const zip = new AdmZip(vsixBuffer);
  const entries = zip.getEntries();
  const packageEntry = entries.find((e) => e.entryName === "extension/package.json" || e.entryName.endsWith("/package.json"));
  if (!packageEntry) {
    throw new Error("VSIX invalid — package.json lipsește.");
  }

  const prefix = packageEntry.entryName.replace(/package\.json$/, "");
  for (const entry of entries) {
    if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue;
    const relative = entry.entryName.slice(prefix.length);
    if (!relative) continue;
    const outPath = path.join(targetDir, relative);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.getData());
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

  ipcMain.handle("openvsx:search", async (_event, query: string) => {
    try {
      const results = await searchOpenVsx(String(query ?? ""), 30);
      return { ok: true, extensions: results };
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, error: msg, extensions: [] };
    }
  });

  ipcMain.handle("openvsx:popular", async () => {
    try {
      const results = await listPopularOpenVsx(30);
      return { ok: true, extensions: results };
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, error: msg, extensions: [] };
    }
  });

  ipcMain.handle(
    "openvsx:install",
    async (event, input: { namespace: string; name: string }) => {
      const root = getWorkspaceRoot(event.sender.id);
      if (!root?.trim()) return { ok: false, error: "Deschide un folder de proiect." };
      if (!input?.namespace?.trim() || !input?.name?.trim()) {
        return { ok: false, error: "namespace și name sunt obligatorii." };
      }

      try {
        const { buffer, version } = await downloadOpenVsxVsix(input.namespace.trim(), input.name.trim());
        const publisher = input.namespace.trim();
        const extName = input.name.trim();
        const folderId = `${publisher}.${extName}-${version.version}`;
        const extDir = path.join(root, ".cavalo", "extensions", folderId);

        extractVsixToDirectory(buffer, extDir);

        const manifestPath = path.join(extDir, "package.json");
        if (!fs.existsSync(manifestPath)) {
          return { ok: false, error: "VSIX extras fără package.json." };
        }

        const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MarketplaceExtensionManifest;
        const report = compatibility.analyze({
          ...pkg,
          publisher: pkg.publisher ?? publisher,
          name: pkg.name ?? extName,
          version: pkg.version ?? version.version,
          engines: pkg.engines ?? version.engines ?? {},
        });

        if (!report.compatible) {
          fs.rmSync(extDir, { recursive: true, force: true });
          return { ok: false, error: "Extensie incompatibilă cu CAVALLO." };
        }

        const manifest: ExtensionManifest = {
          id: folderId,
          name: pkg.name ?? extName,
          version: pkg.version ?? version.version,
          engines: report.convertedManifest.engines,
        };
        extensionHost.register(manifest);
        return { ok: true, extension: manifest };
      } catch (cause: unknown) {
        const msg = cause instanceof Error ? cause.message : String(cause);
        return { ok: false, error: msg };
      }
    }
  );
}

export { extensionHost };
