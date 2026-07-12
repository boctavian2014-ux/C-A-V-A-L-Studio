import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { channelFromEnv, run } from "./ci-utils";
import { runReleasePreflight } from "./release-preflight";

export interface ReleaseStepReport {
  name: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

export interface ReleaseArtifactReport {
  path: string;
  sha256: string;
  sizeBytes: number;
  signed: boolean;
}

export interface ReleaseReport {
  generatedAt: string;
  channel: string;
  version: string;
  platform: "win";
  steps: ReleaseStepReport[];
  artifacts: ReleaseArtifactReport[];
  signingConfigured: boolean;
  ok: boolean;
}

const readVersion = async (): Promise<string> => {
  const raw = await fs.readFile("package.json", "utf8");
  const parsed = JSON.parse(raw) as { version?: string };
  if (!parsed.version?.trim()) {
    throw new Error("package.json version is missing");
  }
  return parsed.version.trim();
};

const sha256File = async (filePath: string): Promise<string> => {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

const isWindowsSigningConfigured = (): boolean =>
  Boolean(process.env.CAVAL_WIN_CERT_SHA1?.trim() || process.env.CAVAL_WIN_CERT_FILE?.trim());

const runStep = async (name: string, task: () => Promise<void>): Promise<ReleaseStepReport> => {
  const startedAt = performance.now();
  try {
    await task();
    return { name, ok: true, durationMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      name,
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      detail: error instanceof Error ? error.message : String(error)
    };
  }
};

const collectWindowsArtifacts = async (releaseDir: string, signedPaths: Set<string>): Promise<ReleaseArtifactReport[]> => {
  const artifacts: ReleaseArtifactReport[] = [];
  const entries = await fs.readdir(releaseDir, { recursive: true }).catch(() => []);

  for (const entry of entries) {
    const relative = entry.toString().replaceAll("\\", "/");
    if (!/\.(exe|msi)$/i.test(relative)) continue;

    const fullPath = path.join(releaseDir, relative);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat?.isFile()) continue;

    artifacts.push({
      path: fullPath.replaceAll("\\", "/"),
      sha256: await sha256File(fullPath),
      sizeBytes: stat.size,
      signed: signedPaths.has(fullPath.replaceAll("\\", "/"))
    });
  }

  return artifacts;
};

const signWindowsArtifacts = async (releaseDir: string): Promise<Set<string>> => {
  const signed = new Set<string>();
  if (!isWindowsSigningConfigured()) {
    console.warn("[warn] Skipping code signing — CAVAL_WIN_CERT_SHA1 or CAVAL_WIN_CERT_FILE not set");
    return signed;
  }

  const entries = await fs.readdir(releaseDir, { recursive: true }).catch(() => []);
  for (const entry of entries) {
    const relative = entry.toString();
    if (!/\.(exe|msi)$/i.test(relative)) continue;

    const artifact = path.join(releaseDir, relative);
    await run("tsx", ["installer/scripts/sign-windows.ts", artifact]);
    signed.add(artifact.replaceAll("\\", "/"));
  }

  return signed;
};

export async function runWindowsRelease(): Promise<ReleaseReport> {
  const channel = channelFromEnv();
  const version = await readVersion();
  const signingConfigured = isWindowsSigningConfigured();
  const steps: ReleaseStepReport[] = [];

  const record = (step: ReleaseStepReport): void => {
    steps.push(step);
    const label = step.ok ? "[ok]" : "[fail]";
    console.log(`${label} ${step.name} (${step.durationMs}ms)${step.detail ? ` — ${step.detail}` : ""}`);
  };

  record(await runStep("preflight:pre", () => runReleasePreflight({ phase: "pre" }).then(() => undefined)));
  if (!steps.at(-1)?.ok) {
    return writeReleaseReport({ channel, version, steps, artifacts: [], signingConfigured, ok: false });
  }

  record(await runStep("typecheck", () => run("npm", ["run", "typecheck"])));
  if (!steps.at(-1)?.ok) {
    return writeReleaseReport({ channel, version, steps, artifacts: [], signingConfigured, ok: false });
  }

  record(await runStep("test", () => run("npm", ["test"])));
  if (!steps.at(-1)?.ok) {
    return writeReleaseReport({ channel, version, steps, artifacts: [], signingConfigured, ok: false });
  }

  record(await runStep("build", () => run("npm", ["run", "build"])));
  if (!steps.at(-1)?.ok) {
    return writeReleaseReport({ channel, version, steps, artifacts: [], signingConfigured, ok: false });
  }

  record(await runStep("preflight:post-build", () => runReleasePreflight({ phase: "post-build" }).then(() => undefined)));
  if (!steps.at(-1)?.ok) {
    return writeReleaseReport({ channel, version, steps, artifacts: [], signingConfigured, ok: false });
  }

  record(await runStep("dist:win", () =>
    run("npm", ["run", "dist:win"], {
      ...process.env,
      CAVAL_RELEASE_CHANNEL: channel,
      CAVAL_BUILD_PLATFORM: "win",
      CI: process.env.CI ?? "true"
    })
  ));
  if (!steps.at(-1)?.ok) {
    return writeReleaseReport({ channel, version, steps, artifacts: [], signingConfigured, ok: false });
  }

  const releaseDir = path.join("release", channel);
  let signedPaths = new Set<string>();
  const signStep = await runStep("sign", async () => {
    signedPaths = await signWindowsArtifacts(releaseDir);
  });
  record(signStep);

  const artifacts = await collectWindowsArtifacts(releaseDir, signedPaths);
  record(await runStep("artifact:hash", async () => {
    if (artifacts.length === 0) {
      throw new Error(`No .exe or .msi artifacts found in ${releaseDir}`);
    }
  }));

  const ok = steps.every((step) => step.ok);
  return writeReleaseReport({ channel, version, steps, artifacts, signingConfigured, ok });
}

async function writeReleaseReport(input: {
  channel: string;
  version: string;
  steps: ReleaseStepReport[];
  artifacts: ReleaseArtifactReport[];
  signingConfigured: boolean;
  ok: boolean;
}): Promise<ReleaseReport> {
  const report: ReleaseReport = {
    generatedAt: new Date().toISOString(),
    channel: input.channel,
    version: input.version,
    platform: "win",
    steps: input.steps,
    artifacts: input.artifacts,
    signingConfigured: input.signingConfigured,
    ok: input.ok
  };

  const releaseDir = path.join("release", input.channel);
  await fs.mkdir(releaseDir, { recursive: true });
  const reportPath = path.join(releaseDir, "release-report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Release report written to ${reportPath.replaceAll("\\", "/")}`);

  if (!input.ok) {
    throw new Error("Windows release pipeline failed — see release-report.json");
  }

  return report;
}

void runWindowsRelease().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
