import fs from "node:fs/promises";
import path from "node:path";
import type { ComposerDiagnostic, ComposerPatchSet } from "../types";

export interface ConflictResolution {
  patchSet: ComposerPatchSet;
  diagnostics: ComposerDiagnostic[];
  requiresUser: boolean;
}

export class ConflictResolver {
  async resolve(workspaceRoot: string, patchSet: ComposerPatchSet): Promise<ConflictResolution> {
    const diagnostics: ComposerDiagnostic[] = [];
    let requiresUser = false;

    for (const file of patchSet.files) {
      const target = path.resolve(workspaceRoot, file.path);
      const current = await fs.readFile(target, "utf8").catch(() => "");
      if (current.includes("<<<<<<<") || current.includes("=======") || current.includes(">>>>>>>")) {
        requiresUser = true;
        diagnostics.push({ level: "error", source: "conflict-resolver", message: `Existing conflict markers require user resolution: ${file.path}`, file: file.path });
      }

      if (file.patch.includes("<<<<<<<") || file.patch.includes(">>>>>>>")) {
        requiresUser = true;
        diagnostics.push({ level: "error", source: "conflict-resolver", message: `Generated patch contains conflict markers: ${file.path}`, file: file.path });
      }
    }

    return {
      patchSet,
      diagnostics,
      requiresUser
    };
  }
}
