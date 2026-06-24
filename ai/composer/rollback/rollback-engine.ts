import fs from "node:fs/promises";
import path from "node:path";
import type { ComposerSnapshot } from "./snapshot-manager";

export class RollbackEngine {
  async rollback(workspaceRoot: string, snapshot: ComposerSnapshot, affectedFiles?: string[]): Promise<string[]> {
    const affected = affectedFiles ? new Set(affectedFiles) : null;
    const restored: string[] = [];

    for (const file of snapshot.files) {
      if (affected && !affected.has(file.path)) {
        continue;
      }

      const target = path.resolve(workspaceRoot, file.path);
      if (file.existed) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.content, "utf8");
      } else {
        await fs.rm(target, { force: true });
      }
      restored.push(file.path);
    }

    return restored;
  }
}
