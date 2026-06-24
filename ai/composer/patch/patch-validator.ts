import path from "node:path";
import type { ComposerDiagnostic, ComposerPatchSet } from "../types";

export class PatchValidator {
  validate(workspaceRoot: string, patchSet: ComposerPatchSet): ComposerDiagnostic[] {
    const diagnostics: ComposerDiagnostic[] = [];

    if (patchSet.files.length === 0) {
      diagnostics.push({ level: "error", source: "patch-validator", message: "Patch set has no files." });
    }

    for (const file of patchSet.files) {
      const resolved = path.resolve(workspaceRoot, file.path);
      if (!resolved.startsWith(path.resolve(workspaceRoot))) {
        diagnostics.push({ level: "error", source: "patch-validator", message: `Patch writes outside workspace: ${file.path}`, file: file.path });
      }

      if (!file.fullContent && !file.patch.includes("@@") && file.patch.trim().length === 0) {
        diagnostics.push({ level: "error", source: "patch-validator", message: `Patch for ${file.path} has no content.`, file: file.path });
      }

      if (file.patch.includes("<<<<<<<") || file.patch.includes(">>>>>>>")) {
        diagnostics.push({ level: "error", source: "patch-validator", message: `Patch contains conflict markers: ${file.path}`, file: file.path });
      }
    }

    return diagnostics;
  }
}
