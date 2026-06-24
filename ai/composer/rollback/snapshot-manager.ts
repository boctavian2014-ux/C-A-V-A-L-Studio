import fs from "node:fs/promises";
import path from "node:path";

export interface ComposerSnapshot {
  id: string;
  createdAt: string;
  files: Array<{
    path: string;
    existed: boolean;
    content: string;
  }>;
}

export class SnapshotManager {
  async create(workspaceRoot: string, files: string[]): Promise<ComposerSnapshot> {
    const snapshotFiles = await Promise.all([...new Set(files)].map(async (file) => {
      const target = path.resolve(workspaceRoot, file);
      try {
        return { path: file, existed: true, content: await fs.readFile(target, "utf8") };
      } catch {
        return { path: file, existed: false, content: "" };
      }
    }));

    return {
      id: `snapshot-${Date.now()}`,
      createdAt: new Date().toISOString(),
      files: snapshotFiles
    };
  }
}
