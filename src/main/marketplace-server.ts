import type { Server } from "node:http";

import { createServer, seedMarketplace } from "../../marketplace/server/index";

const DEFAULT_PORT = Number(process.env.CAVAL_MARKETPLACE_PORT ?? 8787);

let httpServer: Server | null = null;
let starting: Promise<boolean> | null = null;

export function getMarketplaceBaseUrl(port = DEFAULT_PORT): string {
  return `http://127.0.0.1:${port}`;
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startMarketplaceServer(): Promise<boolean> {
  const url = getMarketplaceBaseUrl();
  if (await probeHealth(url)) {
    console.info(`[marketplace] already running at ${url}`);
    return true;
  }

  if (starting) return starting;

  starting = (async () => {
    if (httpServer && (await probeHealth(url, 3_000))) {
      return true;
    }

    try {
      await seedMarketplace();
      const app = createServer();

      await new Promise<void>((resolve, reject) => {
        const server = app.listen(DEFAULT_PORT, "127.0.0.1", () => resolve());
        server.on("error", (error: NodeJS.ErrnoException) => {
          if (error.code === "EADDRINUSE") {
            resolve();
            return;
          }
          reject(error);
        });
        httpServer = server;
      });

      if (await probeHealth(url, 2_000)) {
        console.info(`[marketplace] listening on :${DEFAULT_PORT}`);
        return true;
      }

      for (let i = 0; i < 12; i++) {
        if (await probeHealth(url, 1_200)) {
          console.info(`[marketplace] listening on :${DEFAULT_PORT}`);
          return true;
        }
        await sleep(200);
      }

      console.warn("[marketplace] started but health check timed out");
      return false;
    } catch (error) {
      if (await probeHealth(url, 2_000)) {
        console.info(`[marketplace] already running at ${url}`);
        return true;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[marketplace] failed to start:", message);
      return false;
    }
  })();

  const ok = await starting;
  starting = null;
  return ok;
}

export function stopMarketplaceServer(): void {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}
