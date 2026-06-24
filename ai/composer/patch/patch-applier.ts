import fs from "node:fs/promises";
import path from "node:path";
import type { ComposerPatchSet } from "../types";

export interface AtomicPatchApplyResult {
  applied: boolean;
  changedFiles: string[];
  diagnostics: string[];
}

export class AtomicPatchApplier {
  async apply(workspaceRoot: string, patchSet: ComposerPatchSet, dryRun = false): Promise<AtomicPatchApplyResult> {
    const writes: Array<{ target: string; relative: string; content: string }> = [];
    const diagnostics: string[] = [];

    for (const file of patchSet.files) {
      const target = this.resolve(workspaceRoot, file.path);
      const current = await fs.readFile(target, "utf8").catch(() => "");
      const content = file.fullContent ?? this.applyUnifiedDiff(current, file.patch);

      if (content === current) {
        diagnostics.push(`No changes for ${file.path}.`);
        continue;
      }

      writes.push({ target, relative: file.path, content });
    }

    if (!dryRun) {
      for (const write of writes) {
        await fs.mkdir(path.dirname(write.target), { recursive: true });
        await fs.writeFile(write.target, write.content, "utf8");
      }
    }

    return {
      applied: writes.length > 0 && diagnostics.length === 0,
      changedFiles: writes.map((write) => write.relative),
      diagnostics
    };
  }

  private resolve(workspaceRoot: string, relativePath: string): string {
    const target = path.resolve(workspaceRoot, relativePath);
    if (!target.startsWith(path.resolve(workspaceRoot))) {
      throw new Error(`Refusing to write outside workspace: ${relativePath}`);
    }

    return target;
  }

  private applyUnifiedDiff(current: string, patch: string): string {
    if (!patch.includes("@@")) {
      return patch.trim().length > 0 ? patch : current;
    }

    const currentLines = current.split(/\r?\n/);
    const output: string[] = [];
    let cursor = 0;
    const lines = patch.split(/\r?\n/).filter((line) => !line.startsWith("---") && !line.startsWith("+++"));

    for (let index = 0; index < lines.length; index += 1) {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(lines[index]);
      if (!hunk) continue;
      const oldStart = Number(hunk[1]) - 1;
      output.push(...currentLines.slice(cursor, oldStart));
      cursor = oldStart;
      index += 1;
      while (index < lines.length && !lines[index].startsWith("@@")) {
        const line = lines[index];
        if (line.startsWith(" ")) {
          output.push(line.slice(1));
          cursor += 1;
        } else if (line.startsWith("-")) {
          cursor += 1;
        } else if (line.startsWith("+")) {
          output.push(line.slice(1));
        }
        index += 1;
      }
      index -= 1;
    }

    output.push(...currentLines.slice(cursor));
    return output.join("\n");
  }
}
