import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

  try {
    await fs.writeFile(scadPath, scadSource, "utf8");
    await execFileAsync(
      "openscad",
      ["-o", stlPath, scadPath],
      { timeout: maxMs, maxBuffer: 16 * 1024 * 1024 }
    );
    const stlBuffer = await fs.readFile(stlPath);
    if (!stlBuffer.length) {
      return { ok: false, error: "OpenSCAD produced an empty STL file" };
    }
    return { ok: true, stlBuffer };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT/i.test(message)) {
      return { ok: false, error: "OpenSCAD CLI not installed on server" };
    }
    return { ok: false, error: message };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function fallbackScadForPrompt(prompt: string): string {
  const label = prompt.slice(0, 40).replace(/"/g, "'");
  // Only used when CAD_ALLOW_FALLBACK=1 — clearly marked mock
  return `// MOCK FALLBACK — configure OPENROUTER for real CAD
// Request: ${label}
$fn = 64;
warning() {
  color("red") cube([10, 10, 10], center = true);
}
warning();`;
}
