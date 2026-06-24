import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ComposerDiagnostic } from "../types";

const execFileAsync = promisify(execFile);

export class TestRunner {
  async run(workspaceRoot: string, command = "npm", args = ["test"]): Promise<ComposerDiagnostic[]> {
    try {
      await execFileAsync(command, args, { cwd: workspaceRoot });
      return [];
    } catch (error) {
      return [{
        level: "error",
        source: "test-runner",
        message: error instanceof Error ? error.message : String(error)
      }];
    }
  }
}
