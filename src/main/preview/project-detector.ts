import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { PreviewTarget } from "../../shared/preview-contract";

export type ProjectKind = "vite" | "next" | "expo" | "node" | "unknown";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun" | "unknown";

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface DetectedProject {
  kind: ProjectKind;
  cwd: string;
  hasPackageJson: boolean;
  packageManager: PackageManager;
  suggestedCommand: string | null;
  suggestedUrl: string | null;
}

export interface PreviewWorkspaceDetection {
  workspaceRoot: string;
  web: DetectedProject | null;
  mobile: DetectedProject | null;
}

const MAX_CHILD_SCAN = 24;

function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return "unknown";
}

function readPackageJson(cwd: string): PackageJson | null {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function runnerFor(pm: PackageManager, script: string): string {
  switch (pm) {
    case "yarn":
      return `yarn ${script}`;
    case "pnpm":
      return `pnpm ${script}`;
    case "bun":
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}

function hasAnyFile(cwd: string, names: string[]): boolean {
  return names.some((name) => existsSync(join(cwd, name)));
}

function isExpoProject(cwd: string, deps: Record<string, string | undefined>): boolean {
  return Boolean(
    deps.expo ||
      hasAnyFile(cwd, ["app.json", "app.config.js", "app.config.ts", "app.config.mjs"])
  );
}

function isNextProject(cwd: string, deps: Record<string, string | undefined>): boolean {
  return Boolean(
    deps.next ||
      hasAnyFile(cwd, ["next.config.js", "next.config.mjs", "next.config.ts"])
  );
}

function isViteProject(cwd: string, deps: Record<string, string | undefined>): boolean {
  return Boolean(
    deps.vite ||
      hasAnyFile(cwd, ["vite.config.ts", "vite.config.js", "vite.config.mts"])
  );
}

/**
 * Read-only project detection for preview launch.
 * Order: Expo → Next → Vite → Node generic → unknown.
 */
export function detectProject(cwd: string): DetectedProject {
  const packageManager = detectPackageManager(cwd);
  const pkg = readPackageJson(cwd);

  if (!pkg) {
    return {
      kind: "unknown",
      cwd,
      hasPackageJson: false,
      packageManager,
      suggestedCommand: null,
      suggestedUrl: null,
    };
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts ?? {};

  if (isExpoProject(cwd, deps)) {
    const script = scripts.start ? "start" : null;
    return {
      kind: "expo",
      cwd,
      hasPackageJson: true,
      packageManager,
      suggestedCommand: script ? runnerFor(packageManager, script) : "npx expo start",
      suggestedUrl: null,
    };
  }

  if (isNextProject(cwd, deps)) {
    const script = scripts.dev ? "dev" : "start";
    return {
      kind: "next",
      cwd,
      hasPackageJson: true,
      packageManager,
      suggestedCommand: runnerFor(packageManager, script),
      suggestedUrl: "http://localhost:3000",
    };
  }

  if (isViteProject(cwd, deps)) {
    const script = scripts.dev ? "dev" : "start";
    return {
      kind: "vite",
      cwd,
      hasPackageJson: true,
      packageManager,
      suggestedCommand: runnerFor(packageManager, script),
      suggestedUrl: "http://localhost:5173",
    };
  }

  if (scripts.dev || scripts.start) {
    const script = scripts.dev ? "dev" : "start";
    return {
      kind: "node",
      cwd,
      hasPackageJson: true,
      packageManager,
      suggestedCommand: runnerFor(packageManager, script),
      suggestedUrl: null,
    };
  }

  return {
    kind: "unknown",
    cwd,
    hasPackageJson: true,
    packageManager,
    suggestedCommand: null,
    suggestedUrl: null,
  };
}

function assignTarget(
  detection: DetectedProject,
  target: PreviewTarget,
  current: DetectedProject | null
): DetectedProject | null {
  if (current) return current;
  if (detection.kind === "unknown") return null;
  if (target === "mobile" && detection.kind !== "expo") return null;
  if (target === "web" && detection.kind === "expo") return null;
  return detection;
}

function listDirectChildDirs(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .slice(0, MAX_CHILD_SCAN)
      .map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

/**
 * Scan workspace root first, then direct child directories.
 * Expo → mobile; vite/next/node → web.
 */
export function detectPreviewWorkspace(workspaceRoot: string): PreviewWorkspaceDetection {
  let web: DetectedProject | null = null;
  let mobile: DetectedProject | null = null;

  const rootDetection = detectProject(workspaceRoot);
  web = assignTarget(rootDetection, "web", web);
  mobile = assignTarget(rootDetection, "mobile", mobile);

  for (const child of listDirectChildDirs(workspaceRoot)) {
    const childDetection = detectProject(child);
    web = assignTarget(childDetection, "web", web);
    mobile = assignTarget(childDetection, "mobile", mobile);
    if (web && mobile) break;
  }

  return { workspaceRoot, web, mobile };
}

export function findStaticHtmlPreviewRoot(workspaceRoot: string): string | null {
  const dirs = [
    workspaceRoot,
    join(workspaceRoot, "web"),
    join(workspaceRoot, "public"),
    join(workspaceRoot, "src"),
  ];
  for (const dir of dirs) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return null;
}

const SIMPLE_ROOT_FILE_RE = /\.(txt|md)$/i;

/** Root-only notes/docs — not a web/mobile app. Preview must not demand package.json. */
export function workspaceIsSimpleFilesOnly(workspaceRoot: string): boolean {
  if (existsSync(join(workspaceRoot, "package.json"))) return false;
  let names: string[] = [];
  try {
    names = readdirSync(workspaceRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch {
    return false;
  }
  return names.length > 0 && names.every((name) => SIMPLE_ROOT_FILE_RE.test(name));
}

/** Human-readable reason when Open Web/Mobile cannot start. */
export function describeMissingPreview(target: PreviewTarget, workspaceRoot: string): string {
  const layout = detectPreviewWorkspace(workspaceRoot);
  const detected = target === "web" ? layout.web : layout.mobile;
  const hasPackageJson = existsSync(join(workspaceRoot, "package.json"));

  if (workspaceIsSimpleFilesOnly(workspaceRoot)) {
    return (
      `No ${target} app to preview in ${workspaceRoot}. ` +
      `This folder only has simple files — open them in the editor. Preview is for Vite/Next/Expo.`
    );
  }

  if (!hasPackageJson && !detected) {
    const kind = target === "web" ? "web (Vite/Next)" : "mobile (Expo)";
    return (
      `No ${target} app in ${workspaceRoot}. Missing package.json / ${kind} project. ` +
      `Finish scaffolding first — preview in caval.jsonc cannot start an empty folder.`
    );
  }

  return `No preview command detected for ${target} in ${workspaceRoot}`;
}
