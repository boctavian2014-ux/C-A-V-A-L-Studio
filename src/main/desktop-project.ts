import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const FALLBACK_NAME = "Cavallo-Project";

/** Folder-safe slug for Desktop project directories. */
export function slugifyProjectName(name: string): string {
  const cleaned = (name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s\-_]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || FALLBACK_NAME;
}

export function resolveUniqueDesktopDir(desktopRoot: string, baseName: string): string {
  const slug = slugifyProjectName(baseName);
  let candidate = path.join(desktopRoot, slug);
  if (!fs.existsSync(candidate)) return candidate;
  for (let i = 2; i < 1000; i++) {
    candidate = path.join(desktopRoot, `${slug}-${i}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(desktopRoot, `${slug}-${Date.now()}`);
}

export function createProjectOnDesktop(name: string): {
  ok: boolean;
  path?: string;
  error?: string;
} {
  try {
    const desktop = app.getPath("desktop");
    const dir = resolveUniqueDesktopDir(desktop, name);
    fs.mkdirSync(dir, { recursive: true });
    return { ok: true, path: dir };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
