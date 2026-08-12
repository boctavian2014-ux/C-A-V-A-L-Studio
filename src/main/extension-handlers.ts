import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";

import { ExtensionCompatibility } from "../../marketplace/extensions/compatibility";
import {
  CavalExtensionHost,
  type ExtensionManifest,
} from "../extensions/extension-host";
import {
  atomicInstallValidatedExtension,
  ExtensionInstallError,
  readInstallSidecar,
} from "./extension-install-secure";
import {
  EXTENSION_INSTALL_LIMITS,
  INTEGRITY_METADATA_MISSING_ERROR,
  getMarketplaceAllowedHosts,
  isValidSha256Hex,
  normalizeSha256Hex,
  parseMarketplaceInstallInput,
  parseOpenVsxInstallInput,
  sanitizeExtensionFolderId,
} from "./extension-registry";
import { assertTrustedSender } from "./ipc-trust";
import {
  downloadOpenVsxVsix,
  formatOpenVsxNetworkError,
  listPopularOpenVsx,
  searchOpenVsx,
} from "./open-vsx-client";
import {
  NetworkGuardError,
  NETWORK_GUARD_DEFAULTS,
  safeFetch,
  sanitizeNetworkError,
} from "./network-guard";
import { getMarketplaceBaseUrl, startMarketplaceServer } from "./marketplace-server";

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
      const sidecar = readInstallSidecar(path.join(extDir, entry.name));
      const manifest: ExtensionManifest = {
        id: entry.name,
        name: pkg.name ?? entry.name,
        version: pkg.version ?? "0.0.0",
        engines: pkg.engines ?? {},
        enabled: false,
        status: "installed",
        source: "disk",
        sha256: sidecar?.sha256,
      };
      extensionHost.register(manifest);
    } catch {
      /* skip invalid manifests */
    }
  }
}

function resolveMarketplaceArtifactUrl(
  marketplaceBase: string,
  downloadUrl: string,
  metadataUrl: string
): string {
  const base = marketplaceBase.replace(/\/+$/, "");
  let absolute: URL;
  try {
    absolute = new URL(downloadUrl, `${base}/`);
  } catch {
    throw new ExtensionInstallError("url", "downloadUrl din metadata este invalid.");
  }

  // Must not treat the metadata JSON endpoint as the package bytes.
  if (absolute.href.replace(/\/+$/, "") === metadataUrl.replace(/\/+$/, "")) {
    throw new ExtensionInstallError(
      "artifact",
      "Marketplace nu oferă un artefact VSIX distinct de metadata."
    );
  }

  return absolute.href;
}

/**
 * Lot C2: trust + allowlisted registry + SHA-256 + secure extract.
 * No renderer URLs. Extensions install disabled (no code execution).
 */
export function registerExtensionHandlers(
  getBoundWorkspaceRoot: (senderId: number) => string | undefined
): void {
  ipcMain.handle("extensions:list", async (event) => {
    assertTrustedSender(event);
    const root = getBoundWorkspaceRoot(event.sender.id);
    if (root?.trim()) loadExtensionsFromDisk(root);
    return { ok: true, extensions: extensionHost.list() };
  });

  ipcMain.handle("extensions:register", async (event, manifest: ExtensionManifest) => {
    assertTrustedSender(event);
    if (!manifest?.id) return { ok: false, error: "Invalid manifest" };
    // Memory-only registration — still disabled; does not load/execute code.
    const entry = extensionHost.register({
      ...manifest,
      enabled: false,
      status: "installed",
      source: manifest.source ?? "disk",
    });
    return { ok: true, extension: entry };
  });

  ipcMain.handle("extensions:install", async (event, input: unknown) => {
    assertTrustedSender(event);
    const root = getBoundWorkspaceRoot(event.sender.id)?.trim();
    if (!root) return { ok: false, error: "Deschide un folder de proiect." };

    const parsed = parseMarketplaceInstallInput(input);
    if (!parsed) {
      return {
        ok: false,
        error:
          "Payload invalid: doar extensionId (publisher.extension) este acceptat — fără baseUrl/downloadUrl/URL.",
      };
    }

    try {
      await startMarketplaceServer();
      const marketplaceBase = getMarketplaceBaseUrl().replace(/\/+$/, "");
      const metadataUrl = `${marketplaceBase}/api/extensions/${encodeURIComponent(parsed.extensionId)}/download`;

      const metaRes = await safeFetch(metadataUrl, {
        mode: "marketplace",
        allowedHosts: getMarketplaceAllowedHosts(),
        marketplaceBaseUrl: marketplaceBase,
        maxBytes: EXTENSION_INSTALL_LIMITS.METADATA_MAX_BYTES,
        timeoutMs: NETWORK_GUARD_DEFAULTS.TIMEOUT_MS,
      });

      if (!metaRes.ok) {
        return {
          ok: false,
          error: `Marketplace indisponibil (${metaRes.status}). Rulează npm run marketplace:serve.`,
        };
      }

      let version: {
        version?: string;
        sha256?: string;
        downloadUrl?: string;
        sizeBytes?: number;
        manifest?: Record<string, unknown>;
        engine?: { vscode?: string; caval?: string };
      };
      try {
        version = JSON.parse(metaRes.buffer.toString("utf8")) as typeof version;
      } catch {
        return { ok: false, error: "Metadata marketplace invalidă (JSON)." };
      }

      const shaRaw = typeof version.sha256 === "string" ? version.sha256.trim() : "";
      if (!isValidSha256Hex(shaRaw)) {
        return { ok: false, error: INTEGRITY_METADATA_MISSING_ERROR };
      }
      const expectedSha = normalizeSha256Hex(shaRaw);

      if (typeof version.sizeBytes === "number" && version.sizeBytes > EXTENSION_INSTALL_LIMITS.VSIX_MAX_BYTES) {
        return {
          ok: false,
          error: `Pachetul depășește limita (${version.sizeBytes} > ${EXTENSION_INSTALL_LIMITS.VSIX_MAX_BYTES}).`,
        };
      }

      const downloadUrl = typeof version.downloadUrl === "string" ? version.downloadUrl.trim() : "";
      if (!downloadUrl) {
        return { ok: false, error: INTEGRITY_METADATA_MISSING_ERROR };
      }

      const artifactUrl = resolveMarketplaceArtifactUrl(marketplaceBase, downloadUrl, metadataUrl);

      const artifactRes = await safeFetch(artifactUrl, {
        mode: "marketplace",
        allowedHosts: getMarketplaceAllowedHosts(),
        marketplaceBaseUrl: marketplaceBase,
        maxBytes: EXTENSION_INSTALL_LIMITS.VSIX_MAX_BYTES,
        timeoutMs: NETWORK_GUARD_DEFAULTS.TIMEOUT_MS,
      });
      if (!artifactRes.ok) {
        return { ok: false, error: `Descărcare pachet eșuată (${artifactRes.status}).` };
      }

      const folderId = sanitizeExtensionFolderId(parsed.extensionId);
      const result = atomicInstallValidatedExtension({
        workspaceRoot: root,
        folderId,
        vsixBuffer: artifactRes.buffer,
        expectedSha256: expectedSha,
        source: "marketplace",
        publisherHint: parsed.extensionId.split(".")[0],
        nameHint: parsed.extensionId.split(".").slice(1).join("."),
      });

      const entry = extensionHost.register({
        id: result.extension.id,
        name: result.extension.name,
        version: result.extension.version,
        engines: result.extension.engines,
        enabled: false,
        status: "installed",
        source: "marketplace",
        sha256: result.extension.sha256,
      });

      return { ok: true, extension: entry };
    } catch (cause: unknown) {
      if (cause instanceof ExtensionInstallError) {
        return { ok: false, error: cause.message };
      }
      if (cause instanceof NetworkGuardError) {
        return { ok: false, error: sanitizeNetworkError(cause) };
      }
      const msg = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle("openvsx:search", async (event, query: string) => {
    assertTrustedSender(event);
    try {
      const results = await searchOpenVsx(String(query ?? ""), 30);
      return { ok: true, extensions: results };
    } catch (cause: unknown) {
      return { ok: false, error: formatOpenVsxNetworkError(cause), extensions: [] };
    }
  });

  ipcMain.handle("openvsx:popular", async (event) => {
    assertTrustedSender(event);
    try {
      const results = await listPopularOpenVsx(30);
      return { ok: true, extensions: results };
    } catch (cause: unknown) {
      return { ok: false, error: formatOpenVsxNetworkError(cause), extensions: [] };
    }
  });

  ipcMain.handle("openvsx:install", async (event, input: unknown) => {
    assertTrustedSender(event);
    const root = getBoundWorkspaceRoot(event.sender.id)?.trim();
    if (!root) return { ok: false, error: "Deschide un folder de proiect." };

    const parsed = parseOpenVsxInstallInput(input);
    if (!parsed) {
      return {
        ok: false,
        error: "Payload invalid: doar namespace + name sunt acceptate — fără URL din renderer.",
      };
    }

    try {
      const { buffer, version, sha256 } = await downloadOpenVsxVsix(parsed.namespace, parsed.name);
      const publisher = parsed.namespace;
      const extName = parsed.name;
      const folderId = sanitizeExtensionFolderId(`${publisher}.${extName}-${version.version}`);

      const pkgProbe = (() => {
        // Compatibility check uses package.json after extract — atomic install validates first.
        return {
          publisher,
          name: extName,
          version: version.version,
          engines: version.engines ?? {},
        };
      })();

      const report = compatibility.analyze({
        ...pkgProbe,
        engines: pkgProbe.engines ?? {},
      });
      if (!report.compatible) {
        return { ok: false, error: "Extensie incompatibilă cu CAVALLO." };
      }

      const result = atomicInstallValidatedExtension({
        workspaceRoot: root,
        folderId,
        vsixBuffer: buffer,
        expectedSha256: sha256,
        source: "openvsx",
        publisherHint: publisher,
        nameHint: extName,
      });

      // Re-check engines from installed package (already validated in extract).
      const installedPkgPath = path.join(result.installDir, "package.json");
      const installedPkg = JSON.parse(fs.readFileSync(installedPkgPath, "utf8")) as {
        name?: string;
        version?: string;
        engines?: { vscode?: string; caval?: string };
        publisher?: string;
      };
      const finalReport = compatibility.analyze({
        name: installedPkg.name ?? extName,
        publisher: installedPkg.publisher ?? publisher,
        version: installedPkg.version ?? version.version,
        engines: installedPkg.engines ?? version.engines ?? {},
      });
      if (!finalReport.compatible) {
        fs.rmSync(result.installDir, { recursive: true, force: true });
        return { ok: false, error: "Extensie incompatibilă cu CAVALLO." };
      }

      const entry = extensionHost.register({
        id: result.extension.id,
        name: result.extension.name,
        version: result.extension.version,
        engines: finalReport.convertedManifest.engines,
        enabled: false,
        status: "installed",
        source: "openvsx",
        sha256: result.extension.sha256,
      });

      return { ok: true, extension: entry };
    } catch (cause: unknown) {
      if (cause instanceof ExtensionInstallError) {
        return { ok: false, error: cause.message };
      }
      return { ok: false, error: formatOpenVsxNetworkError(cause) };
    }
  });
}

export { extensionHost };

/** Test-only: reset in-memory host between cases. */
export function __resetExtensionHostForTests(): void {
  extensionHost.clear();
}
