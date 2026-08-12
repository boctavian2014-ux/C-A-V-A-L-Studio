import fs from "node:fs/promises";
import path from "node:path";
import { PR_QUALITY_GATES, RELEASE_ONLY_GATES, runQualityGates } from "./quality-gates";

export type PreflightPhase = "pre" | "post-build";

export type PreflightSeverity = "error" | "warning";

export interface PreflightCheck {
  id: string;
  ok: boolean;
  message: string;
  severity: PreflightSeverity;
}

export interface PreflightResult {
  ok: boolean;
  phase: PreflightPhase;
  checks: PreflightCheck[];
}

export interface PreflightOptions {
  root?: string;
  phase?: PreflightPhase;
}

const REQUIRED_PRE_FILES = [
  "build-icons/icon.ico",
  "installer/config/electron-builder.yml",
  "installer/assets/license.rtf",
  "package.json"
] as const;

const POST_BUILD_FILES = [
  "dist/main/electron-main.js",
  "dist/main/parallel-worker.js",
  "dist/main/preload.js",
] as const;

const fileExists = async (root: string, relativePath: string): Promise<boolean> => {
  try {
    await fs.access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
};

const readPackageVersion = async (root: string): Promise<string | null> => {
  try {
    const raw = await fs.readFile(path.join(root, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" && parsed.version.trim() ? parsed.version.trim() : null;
  } catch {
    return null;
  }
};

const isWindowsSigningConfigured = (): boolean =>
  Boolean(process.env.CAVAL_WIN_CERT_SHA1?.trim() || process.env.CAVAL_WIN_CERT_FILE?.trim());

export async function collectPreflightChecks(options: PreflightOptions = {}): Promise<PreflightResult> {
  const root = options.root ?? process.cwd();
  const phase = options.phase ?? "pre";
  const checks: PreflightCheck[] = [];

  if (phase === "pre") {
    for (const relativePath of REQUIRED_PRE_FILES) {
      const exists = await fileExists(root, relativePath);
      checks.push({
        id: `file:${relativePath}`,
        ok: exists,
        message: exists ? `Found ${relativePath}` : `Missing required file: ${relativePath}`,
        severity: "error"
      });
    }

    const version = await readPackageVersion(root);
    checks.push({
      id: "package:version",
      ok: version !== null,
      message: version ? `package.json version: ${version}` : "package.json is missing a valid version field",
      severity: "error"
    });

    const signingConfigured = isWindowsSigningConfigured();
    checks.push({
      id: "signing:windows",
      ok: true,
      message: signingConfigured
        ? "Windows code signing certificate is configured"
        : "Windows signing not configured — release artifacts will be unsigned (OK for local dev)",
      severity: signingConfigured ? "error" : "warning"
    });
  }

  if (phase === "post-build") {
    for (const relativePath of POST_BUILD_FILES) {
      const exists = await fileExists(root, relativePath);
      checks.push({
        id: `file:${relativePath}`,
        ok: exists,
        message: exists ? `Found ${relativePath}` : `Missing build output: ${relativePath}`,
        severity: "error"
      });
    }
  }

  const ok = checks.every((check) => check.ok || check.severity === "warning");
  return { ok, phase, checks };
}

export async function runReleasePreflight(options: PreflightOptions = {}): Promise<PreflightResult> {
  const result = await collectPreflightChecks(options);

  for (const check of result.checks) {
    const prefix = check.ok ? "[ok]" : check.severity === "warning" ? "[warn]" : "[fail]";
    console.log(`${prefix} ${check.message}`);
  }

  if (!result.ok) {
    throw new Error(`Release preflight failed (${result.phase})`);
  }

  return result;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("release-preflight.ts");

if (isMain) {
  const filesOnly = process.argv.includes("--files-only");
  const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
  const phase = phaseArg?.slice("--phase=".length) === "post-build" ? "post-build" : "pre";
  const skipSmoke = process.env.CAVAL_PREFLIGHT_SKIP_SMOKE === "1" || process.argv.includes("--skip-smoke");

  void (async () => {
    if (!filesOnly && !phaseArg) {
      console.log("[preflight] PR quality gates (typecheck → lint → test → build → verify-runtime-assets)");
      await runQualityGates(PR_QUALITY_GATES);
      await runReleasePreflight({ phase: "pre" });
      await runReleasePreflight({ phase: "post-build" });
      if (!skipSmoke) {
        console.log("[preflight] release-only gate: Electron smoke");
        await runQualityGates(RELEASE_ONLY_GATES);
      }
      return;
    }
    await runReleasePreflight({ phase });
  })().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
