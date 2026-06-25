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
  return `// Fallback cap — ${label}
$fn = 64;
outer_d = 80;
height = 25;
wall = 2.5;

module cap() {
  difference() {
    cylinder(h = height, d = outer_d, center = false);
    translate([0, 0, wall])
      cylinder(h = height, d = outer_d - 2 * wall, center = false);
  }
}

cap();`;
}
