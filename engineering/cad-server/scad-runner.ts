import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let openscadBinaryCache: string | null | undefined;

export const OPENSCAD_INSTALL_HINT_RO =
  "OpenSCAD nu e instalat pe acest PC. Instalează de la openscad.org sau: winget install OpenSCAD.OpenSCAD — alternativ, adaugă cheia Meshy (Setări → mesh.apiKey) pentru a genera 3D direct din text, fără OpenSCAD.";

export function discoverOpenScadBinary(): string | null {
  const envPath = process.env.OPENSCAD_PATH?.trim();
  if (envPath && fsSync.existsSync(envPath)) return envPath;

  const candidates: string[] = [];
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    candidates.push(
      "C:\\Program Files\\OpenSCAD\\openscad.exe",
      "C:\\Program Files (x86)\\OpenSCAD\\openscad.exe"
    );
    if (local) {
      candidates.push(path.join(local, "Programs", "OpenSCAD", "openscad.exe"));
    }
  }

  for (const candidate of candidates) {
    try {
      if (fsSync.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Resolve OpenSCAD binary — PATH, OPENSCAD_PATH, or common Windows install dirs. */
export function resolveOpenScadBinary(): string {
  return discoverOpenScadBinary() ?? "openscad";
}

export async function isOpenScadInstalled(): Promise<boolean> {
  if (openscadBinaryCache !== undefined) {
    return openscadBinaryCache !== null;
  }

  const primary = resolveOpenScadBinary();
  for (const binary of primary === "openscad" ? [primary] : [primary, "openscad"]) {
    try {
      await execFileAsync(binary, ["--version"], { timeout: 8_000 });
      openscadBinaryCache = binary;
      return true;
    } catch {
      /* try next */
    }
  }

  openscadBinaryCache = null;
  return false;
}

export function resetOpenScadProbeCacheForTests(): void {
  openscadBinaryCache = undefined;
}

export interface RenderScadResult {
  ok: boolean;
  stlBuffer?: Buffer;
  error?: string;
}

export async function renderScadToStl(
  scadSource: string,
  jobId: string,
  maxMs = Number(process.env.CAD_MAX_RENDER_MS ?? 120_000)
): Promise<RenderScadResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-cad-"));
  const scadPath = path.join(tmpDir, `${jobId}.scad`);
  const stlPath = path.join(tmpDir, `${jobId}.stl`);
  const openscad = resolveOpenScadBinary();

  try {
    await fs.writeFile(scadPath, scadSource, "utf8");
    await execFileAsync(openscad, ["-o", stlPath, scadPath], {
      timeout: maxMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    const stlBuffer = await fs.readFile(stlPath);
    if (!stlBuffer.length) {
      return { ok: false, error: "OpenSCAD produced an empty STL file" };
    }
    return { ok: true, stlBuffer };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT/i.test(message)) {
      return { ok: false, error: OPENSCAD_INSTALL_HINT_RO };
    }
    return { ok: false, error: message };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function fallbackScadForPrompt(prompt: string): string {
  const label = prompt.slice(0, 40).replace(/"/g, "'");
  return `// MOCK FALLBACK — configure OPENROUTER for real CAD
// Request: ${label}
$fn = 64;
warning() {
  color("red") cube([10, 10, 10], center = true);
}
warning();`;
}
