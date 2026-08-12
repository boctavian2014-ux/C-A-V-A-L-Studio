/**
 * Lot C2 — secure VSIX install foundation (no code execution).
 * Temp download → size → SHA-256 → extract (zip-slip / zip-bomb) →
 * manifest gate → atomic move into `.cavalo/extensions`.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";

import { resolveInsideDir, resolveSandboxedWorkspacePath } from "./path-security";
import {
  EXTENSION_INSTALL_LIMITS,
  INTEGRITY_METADATA_MISSING_ERROR,
  isValidSha256Hex,
  normalizeSha256Hex,
  sanitizeExtensionFolderId,
} from "./extension-registry";

export type ExtensionRuntimeStatus = "installed";

export interface SecureInstallMeta {
  id: string;
  name: string;
  version: string;
  publisher?: string;
  engines: { vscode?: string; caval?: string };
  source: "openvsx" | "marketplace";
  sha256: string;
  /** Always false until SEC-EXT-RUNTIME-PERMISSIONS-001. */
  enabled: false;
  status: ExtensionRuntimeStatus;
}

export interface SecureInstallResult {
  ok: true;
  extension: SecureInstallMeta;
  installDir: string;
}

export class ExtensionInstallError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ExtensionInstallError";
    this.code = code;
  }
}

const NATIVE_EXEC_RE = /\.(exe|dll|so|dylib|node|bin|com|bat|cmd|ps1|sh)$/i;
const LIFECYCLE_SCRIPT_KEYS = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
  "prepublishOnly",
  "prepack",
  "postpack",
] as const;

export function computeSha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Accept raw hex or `sha256-<hex>` / trailing filename forms from registry files. */
export function parseSha256Digest(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const shaPrefix = firstLine.match(/^sha256[_-]?([a-f0-9]{64})$/i);
  if (shaPrefix) return normalizeSha256Hex(shaPrefix[1]!);
  const hexOnly = firstLine.match(/^([a-f0-9]{64})\b/i);
  if (hexOnly) return normalizeSha256Hex(hexOnly[1]!);
  const spaced = firstLine.match(/^([a-f0-9]{64})\s+/i);
  if (spaced) return normalizeSha256Hex(spaced[1]!);
  if (isValidSha256Hex(firstLine)) return normalizeSha256Hex(firstLine);
  return null;
}

export function assertExpectedSha256(buffer: Buffer, expectedHex: string): string {
  if (!isValidSha256Hex(expectedHex)) {
    throw new ExtensionInstallError("integrity_metadata", INTEGRITY_METADATA_MISSING_ERROR);
  }
  const actual = computeSha256Hex(buffer);
  const expected = normalizeSha256Hex(expectedHex);
  if (actual !== expected) {
    throw new ExtensionInstallError(
      "integrity_mismatch",
      `Integritate VSIX eșuată (SHA-256 așteptat ${expected}, obținut ${actual}).`
    );
  }
  return actual;
}

export function assertVsixSizeLimit(byteLength: number, contentLengthHeader?: string | null): void {
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > EXTENSION_INSTALL_LIMITS.VSIX_MAX_BYTES) {
      throw new ExtensionInstallError(
        "size",
        `VSIX depășește limita (${declared} > ${EXTENSION_INSTALL_LIMITS.VSIX_MAX_BYTES} bytes).`
      );
    }
  }
  if (byteLength > EXTENSION_INSTALL_LIMITS.VSIX_MAX_BYTES) {
    throw new ExtensionInstallError(
      "size",
      `VSIX depășește limita (${byteLength} > ${EXTENSION_INSTALL_LIMITS.VSIX_MAX_BYTES} bytes).`
    );
  }
}

function isZipMagic(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function entryLooksNativeExecutable(entryName: string): boolean {
  const base = path.posix.basename(entryName.replace(/\\/g, "/"));
  return NATIVE_EXEC_RE.test(base);
}

export interface ValidatedPackageJson {
  name: string;
  publisher?: string;
  version: string;
  engines: { vscode?: string; caval?: string };
  main?: string;
  browser?: string;
  raw: Record<string, unknown>;
}

export function validateExtensionPackageJson(raw: unknown): ValidatedPackageJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ExtensionInstallError("manifest", "Manifest package.json invalid.");
  }
  const pkg = raw as Record<string, unknown>;
  const name = typeof pkg.name === "string" ? pkg.name.trim() : "";
  const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
  if (!name || !version) {
    throw new ExtensionInstallError("manifest", "Manifest lipsă name/version.");
  }

  const enginesRaw = pkg.engines;
  const engines: { vscode?: string; caval?: string } = {};
  if (enginesRaw && typeof enginesRaw === "object" && !Array.isArray(enginesRaw)) {
    const e = enginesRaw as Record<string, unknown>;
    if (typeof e.vscode === "string") engines.vscode = e.vscode;
    if (typeof e.caval === "string") engines.caval = e.caval;
  }
  if (!engines.vscode && !engines.caval) {
    throw new ExtensionInstallError("manifest", "Manifest necesită engines.vscode sau engines.caval.");
  }

  const scripts = pkg.scripts;
  if (scripts && typeof scripts === "object" && !Array.isArray(scripts)) {
    const s = scripts as Record<string, unknown>;
    for (const key of LIFECYCLE_SCRIPT_KEYS) {
      if (key in s && s[key] != null && String(s[key]).trim() !== "") {
        throw new ExtensionInstallError(
          "manifest_scripts",
          `Manifest interzis: scripts.${key} (lifecycle) nu este permis.`
        );
      }
    }
  }

  for (const field of ["main", "browser", "module"] as const) {
    const value = pkg[field];
    if (typeof value !== "string" || !value.trim()) continue;
    const entry = value.replace(/\\/g, "/").trim();
    if (entry.startsWith("/") || entry.includes("..") || /^[a-zA-Z]:/.test(entry)) {
      throw new ExtensionInstallError(
        "manifest_entrypoint",
        `Manifest interzis: ${field} în afara rădăcinii extensiei.`
      );
    }
  }

  return {
    name,
    publisher: typeof pkg.publisher === "string" ? pkg.publisher : undefined,
    version,
    engines,
    main: typeof pkg.main === "string" ? pkg.main : undefined,
    browser: typeof pkg.browser === "string" ? pkg.browser : undefined,
    raw: pkg,
  };
}

/**
 * Extract VSIX into extractDir with zip-slip + zip-bomb defenses.
 * Does not touch the final install location.
 */
export function extractVsixSecure(vsixBuffer: Buffer, extractDir: string): ValidatedPackageJson {
  if (!isZipMagic(vsixBuffer)) {
    throw new ExtensionInstallError("format", "Artefactul nu este un VSIX/ZIP valid.");
  }
  assertVsixSizeLimit(vsixBuffer.length);

  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  fs.mkdirSync(extractDir, { recursive: true });

  let zip: AdmZip;
  try {
    zip = new AdmZip(vsixBuffer);
  } catch {
    throw new ExtensionInstallError("format", "VSIX corupt — nu poate fi citit ca ZIP.");
  }

  const entries = zip.getEntries();
  if (entries.length > EXTENSION_INSTALL_LIMITS.ZIP_MAX_ENTRIES) {
    throw new ExtensionInstallError(
      "zip_bomb",
      `VSIX are prea multe fișiere (${entries.length} > ${EXTENSION_INSTALL_LIMITS.ZIP_MAX_ENTRIES}).`
    );
  }

  let uncompressedTotal = 0;
  for (const entry of entries) {
    const entryName = entry.entryName.replace(/\\/g, "/");
    // Reject zip-slip markers in ANY entry (including non-extension payload).
    if (entryName.split("/").includes("..") || entryName.includes("\0") || path.isAbsolute(entryName)) {
      throw new ExtensionInstallError("zip_slip", `Zip-slip respins: ${entry.entryName}`);
    }
    if (entry.isDirectory) continue;
    // Prefer ZIP header size — avoid decompressing before limits are enforced.
    const headerSize = entry.header?.size;
    if (typeof headerSize !== "number" || headerSize < 0) {
      throw new ExtensionInstallError("zip_bomb", `VSIX entry fără size valid: ${entry.entryName}`);
    }
    uncompressedTotal += headerSize;
    if (uncompressedTotal > EXTENSION_INSTALL_LIMITS.ZIP_MAX_UNCOMPRESSED_BYTES) {
      throw new ExtensionInstallError(
        "zip_bomb",
        `VSIX decomprimat depășește limita (${EXTENSION_INSTALL_LIMITS.ZIP_MAX_UNCOMPRESSED_BYTES} bytes).`
      );
    }
    if (entryLooksNativeExecutable(entry.entryName)) {
      throw new ExtensionInstallError(
        "native_binary",
        `VSIX conține executabil nativ interzis: ${entry.entryName}`
      );
    }
  }

  const packageEntry = entries.find(
    (e) => e.entryName === "extension/package.json" || e.entryName.endsWith("/package.json")
  );
  if (!packageEntry || packageEntry.isDirectory) {
    throw new ExtensionInstallError("manifest", "VSIX invalid — package.json lipsește.");
  }

  let validated: ValidatedPackageJson;
  try {
    const pkgJson = JSON.parse(packageEntry.getData().toString("utf8")) as unknown;
    validated = validateExtensionPackageJson(pkgJson);
  } catch (err) {
    if (err instanceof ExtensionInstallError) throw err;
    throw new ExtensionInstallError("manifest", "package.json din VSIX nu poate fi parsat.");
  }

  const prefix = packageEntry.entryName.replace(/package\.json$/, "");
  const realTarget = fs.realpathSync(extractDir);

  for (const entry of entries) {
    if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue;
    const relative = entry.entryName.slice(prefix.length);
    if (!relative || relative.includes("..")) {
      throw new ExtensionInstallError("zip_slip", `Zip-slip respins: ${entry.entryName}`);
    }
    const normalizedRel = relative.replace(/\\/g, "/");
    if (normalizedRel.startsWith("/") || normalizedRel.includes("\0")) {
      throw new ExtensionInstallError("zip_slip", `Zip-slip respins: ${entry.entryName}`);
    }

    const outPath = path.join(extractDir, ...normalizedRel.split("/"));
    try {
      resolveSandboxedWorkspacePath(realTarget, outPath);
    } catch {
      throw new ExtensionInstallError("zip_slip", `Zip-slip respins: ${entry.entryName}`);
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.getData());
  }

  const writtenManifest = path.join(extractDir, "package.json");
  if (!fs.existsSync(writtenManifest)) {
    throw new ExtensionInstallError("manifest", "Extract eșuat — package.json lipsă după unzip.");
  }

  return validated;
}

export function createInstallTempDir(prefix = "caval-ext-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupInstallPath(target: string | null | undefined): void {
  if (!target) return;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function writeInstallSidecar(installDir: string, meta: SecureInstallMeta): void {
  const sidecar = {
    status: meta.status,
    enabled: false as const,
    id: meta.id,
    name: meta.name,
    version: meta.version,
    source: meta.source,
    sha256: meta.sha256,
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(installDir, ".caval-extension.json"), JSON.stringify(sidecar, null, 2), "utf8");
}

/**
 * Atomic install: extract+validate in staging, then replace final dir.
 * On failure: leave previous install untouched; clean temps.
 */
export function atomicInstallValidatedExtension(options: {
  workspaceRoot: string;
  folderId: string;
  vsixBuffer: Buffer;
  expectedSha256: string;
  source: "openvsx" | "marketplace";
  publisherHint?: string;
  nameHint?: string;
}): SecureInstallResult {
  const folderId = sanitizeExtensionFolderId(options.folderId);
  const extensionsParent = path.join(options.workspaceRoot, ".cavalo", "extensions");
  fs.mkdirSync(extensionsParent, { recursive: true });

  const finalDir = resolveInsideDir(extensionsParent, folderId);
  if (!finalDir) {
    throw new ExtensionInstallError("path", "Invalid extension install path");
  }

  const actualSha = assertExpectedSha256(options.vsixBuffer, options.expectedSha256);

  // Stage under extensions parent so rename stays same-volume (Windows EXDEV-safe).
  const stageId = `.staging-${folderId}-${process.pid}-${Date.now()}`;
  const tempRoot = resolveInsideDir(extensionsParent, stageId);
  if (!tempRoot) {
    throw new ExtensionInstallError("path", "Invalid staging path");
  }
  const extractDir = path.join(tempRoot, "extract");
  const stagedFinal = path.join(tempRoot, "staged");
  const backupDir = path.join(tempRoot, "backup-prev");

  cleanupInstallPath(tempRoot);
  fs.mkdirSync(tempRoot, { recursive: true });

  try {
    const validated = extractVsixSecure(options.vsixBuffer, extractDir);

    fs.renameSync(extractDir, stagedFinal);

    const meta: SecureInstallMeta = {
      id: folderId,
      name: validated.name || options.nameHint || folderId,
      version: validated.version,
      publisher: validated.publisher ?? options.publisherHint,
      engines: validated.engines,
      source: options.source,
      sha256: actualSha,
      enabled: false,
      status: "installed",
    };
    writeInstallSidecar(stagedFinal, meta);

    const prevExists = fs.existsSync(finalDir);
    if (prevExists) {
      // Keep previous until staged is validated. Move aside for rollback.
      fs.renameSync(finalDir, backupDir);
    }

    try {
      fs.renameSync(stagedFinal, finalDir);
    } catch (moveErr) {
      if (prevExists && fs.existsSync(backupDir) && !fs.existsSync(finalDir)) {
        try {
          fs.renameSync(backupDir, finalDir);
        } catch {
          /* ignore secondary */
        }
      }
      throw moveErr instanceof ExtensionInstallError
        ? moveErr
        : new ExtensionInstallError(
            "atomic_move",
            moveErr instanceof Error ? moveErr.message : "Atomic move failed"
          );
    }

    cleanupInstallPath(tempRoot);

    return { ok: true, extension: meta, installDir: finalDir };
  } catch (err) {
    // Restore previous version if we moved it aside but never replaced.
    if (fs.existsSync(backupDir) && !fs.existsSync(finalDir)) {
      try {
        fs.renameSync(backupDir, finalDir);
      } catch {
        /* ignore */
      }
    }
    cleanupInstallPath(tempRoot);
    throw err;
  }
}

/** Load install sidecar if present (disabled-by-default marker). */
export function readInstallSidecar(installDir: string): { enabled: false; status: "installed"; sha256?: string } | null {
  const p = path.join(installDir, ".caval-extension.json");
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
      enabled?: unknown;
      status?: unknown;
      sha256?: unknown;
    };
    return {
      enabled: false,
      status: "installed",
      sha256: typeof raw.sha256 === "string" ? raw.sha256 : undefined,
    };
  } catch {
    return null;
  }
}
