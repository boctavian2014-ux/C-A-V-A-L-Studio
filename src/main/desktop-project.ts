import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const FALLBACK_NAME = "Cavallo-Project";

export type LocalProjectLocation = "desktop" | "downloads";

/** Folder-safe slug for Desktop / Downloads project directories. */
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

export function resolveUniqueDesktopDir(parentRoot: string, baseName: string): string {
  const slug = slugifyProjectName(baseName);
  let candidate = path.join(parentRoot, slug);
  if (!fs.existsSync(candidate)) return candidate;
  for (let i = 2; i < 1000; i++) {
    candidate = path.join(parentRoot, `${slug}-${i}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(parentRoot, `${slug}-${Date.now()}`);
}

/**
 * Create a new project folder on Desktop; if that fails, fall back to Downloads.
 */
export function createProjectOnDesktop(name: string): {
  ok: boolean;
  path?: string;
  location?: LocalProjectLocation;
  error?: string;
} {
  const attempts: Array<{ location: LocalProjectLocation; key: "desktop" | "downloads" }> = [
    { location: "desktop", key: "desktop" },
    { location: "downloads", key: "downloads" },
  ];
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const parent = app.getPath(attempt.key);
      const dir = resolveUniqueDesktopDir(parent, name);
      fs.mkdirSync(dir, { recursive: true });
      return { ok: true, path: dir, location: attempt.location };
    } catch (error) {
      errors.push(
        `${attempt.location}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    ok: false,
    error: errors.join("; ") || "Could not create project on Desktop or Downloads",
  };
}
