import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ComposerDiagnostic } from "../types";

const execFileAsync = promisify(execFile);

export class BuildChecker {
  async run(workspaceRoot: string, command = "npm", args = ["run", "build"]): Promise<ComposerDiagnostic[]> {
    try {
      await execFileAsync(command, args, { cwd: workspaceRoot });
      return [];
    } catch (error) {
      return [{
        level: "error",
        source: "build-checker",
        message: error instanceof Error ? error.message : String(error)
      }];
    }
  }
}
