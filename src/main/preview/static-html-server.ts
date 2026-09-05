import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

function safeFile(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent((urlPath.split("?")[0] || "/")).replace(/\\/g, "/");
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\//, "");
  if (!relative || relative.includes("\0")) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    if (decoded.endsWith("/") || !path.extname(relative)) {
      const index = path.resolve(resolvedRoot, relative, "index.html");
      const indexRel = path.relative(resolvedRoot, index);
      if (indexRel.startsWith("..") || path.isAbsolute(indexRel)) return null;
      if (existsSync(index) && statSync(index).isFile()) return index;
    }
    return null;
  }
  return resolved;
}

export function startStaticHtmlServer(root: string): Promise<{ server: http.Server; url: string }> {
  const resolvedRoot = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const file = safeFile(resolvedRoot, req.url ?? "/");
      if (!file) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      createReadStream(file).pipe(res);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Static preview server failed to bind"));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}
