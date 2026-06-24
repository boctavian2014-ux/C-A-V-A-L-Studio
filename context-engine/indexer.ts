import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ContextChunk, IndexedDocument } from "./types";

const DEFAULT_INCLUDE = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html"]);

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /\.env$/i
];

const REDACTED_EXTENSIONS = new Set([".env", ".pem", ".key", ".p12"]);

export class ProjectIndexer {
  constructor(private readonly includeExtensions = DEFAULT_INCLUDE) {}

  async scanProject(rootDir: string): Promise<IndexedDocument[]> {
    const files = await this.walk(rootDir);
    const documents: IndexedDocument[] = [];

    for (const filePath of files) {
      const ext = path.extname(filePath);
      const basename = path.basename(filePath);
      if (!this.includeExtensions.has(ext) || REDACTED_EXTENSIONS.has(ext) || SECRET_PATTERNS.some((p) => p.test(basename))) {
        continue;
      }

      const content = await fs.readFile(filePath, "utf8");
      documents.push(this.indexFile(rootDir, filePath, this.redactSecrets(content)));
    }

    return documents;
  }

  indexFile(rootDir: string, filePath: string, content: string): IndexedDocument {
    const relativePath = path.relative(rootDir, filePath);
    const documentId = this.hash(relativePath);

    return {
      id: documentId,
      path: relativePath,
      language: path.extname(filePath).replace(".", "") || "text",
      contentHash: this.hash(content),
      chunks: this.chunk(documentId, relativePath, content)
    };
  }

  private chunk(documentId: string, relativePath: string, content: string, size = 80): ContextChunk[] {
    const lines = content.split(/\r?\n/);
    const chunks: ContextChunk[] = [];

    for (let index = 0; index < lines.length; index += size) {
      const slice = lines.slice(index, index + size);
      chunks.push({
        id: `${documentId}:${index + 1}`,
        documentId,
        path: relativePath,
        text: slice.join("\n"),
        startLine: index + 1,
        endLine: index + slice.length
      });
    }

    return chunks;
  }

  private async walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" || entry.name === ".caval") {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.walk(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private hash(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  private redactSecrets(content: string): string {
    return content
      .replace(/(api[_-]?key\s*[:=]\s*)(["']?)[^"'\n]+/gi, "$1$2[REDACTED]")
      .replace(/(secret\s*[:=]\s*)(["']?)[^"'\n]+/gi, "$1$2[REDACTED]")
      .replace(/(password\s*[:=]\s*)(["']?)[^"'\n]+/gi, "$1$2[REDACTED]");
  }
}
