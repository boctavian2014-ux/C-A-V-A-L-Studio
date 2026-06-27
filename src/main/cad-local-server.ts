import { spawn, type ChildProcess } from "node:child_process";
import fsSync from "node:fs";
import path from "node:path";

const DEFAULT_PORT = Number(process.env.CAD_PORT ?? 8791);
const LOCAL_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

let cadChild: ChildProcess | null = null;
let starting: Promise<boolean> | null = null;

async function probeHealth(baseUrl: string, timeoutMs = 1_500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function resolveTsxLaunch(): { command: string; args: string[]; shell: boolean } {
  const entry = path.join(process.cwd(), "engineering", "cad-server", "standalone.ts");
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  if (fsExists(tsxCli)) {
    return { command: process.execPath, args: [tsxCli, entry], shell: false };
  }
  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["tsx", entry],
    shell: process.platform === "win32",
  };
}

export async function ensureCadLocalServer(): Promise<boolean> {
  if (await probeHealth(LOCAL_URL)) {
    process.env.CAD_USE_LOCAL = "1";
    process.env.CAD_API_URL = LOCAL_URL;
    return true;
  }

  if (starting) return starting;

  starting = (async () => {
    if (cadChild) return probeHealth(LOCAL_URL, 3_000);

    const { command, args, shell } = resolveTsxLaunch();

    cadChild = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CAD_PORT: String(DEFAULT_PORT),
        CAD_USE_LOCAL: "1",
        CAD_ALLOW_ANONYMOUS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell,
    });

    cadChild.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) console.warn("[cad-server]", line);
    });
    cadChild.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) console.info("[cad-server]", line);
    });

    cadChild.on("exit", (code) => {
      if (code && code !== 0) {
        console.warn(`[cad] local server exited with code ${code}`);
      }
      cadChild = null;
    });

    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (await probeHealth(LOCAL_URL, 1_200)) {
        process.env.CAD_USE_LOCAL = "1";
        process.env.CAD_API_URL = LOCAL_URL;
        console.info(`[cad] local server ready at ${LOCAL_URL}`);
        return true;
      }
    }
    console.warn("[cad] local server failed to start — run: npm run cad:serve");
    return false;
  })();

  const ok = await starting;
  starting = null;
  return ok;
}

export function stopCadLocalServer(): void {
  if (cadChild && !cadChild.killed) {
    cadChild.kill();
  }
  cadChild = null;
}

export function localCadUrl(): string {
  return LOCAL_URL;
}

function fsExists(p: string): boolean {
  try {
    fsSync.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
