import fs from "node:fs/promises";
import path from "node:path";
import type { IndexedDocument } from "./types";

export class LocalContextCache {
  constructor(private readonly cacheDir = ".caval/context-cache") {}

  async write(rootDir: string, documents: IndexedDocument[]): Promise<void> {
    const targetDir = path.join(rootDir, this.cacheDir);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "documents.json"), JSON.stringify(documents, null, 2), "utf8");
  }

  async read(rootDir: string): Promise<IndexedDocument[] | null> {
    try {
      const cachePath = path.join(rootDir, this.cacheDir, "documents.json");
      return JSON.parse(await fs.readFile(cachePath, "utf8")) as IndexedDocument[];
    } catch {
      return null;
    }
  }
}
