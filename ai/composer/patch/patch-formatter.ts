import type { ComposerPatchSet } from "../types";

export class PatchFormatter {
  format(patchSet: ComposerPatchSet): ComposerPatchSet {
    return {
      summary: patchSet.summary.trim(),
      files: patchSet.files.map((file) => ({
        ...file,
        path: file.path.replaceAll("\\", "/").trim(),
        patch: this.normalizeWhitespace(file.patch),
        fullContent: file.fullContent ? this.normalizeWhitespace(file.fullContent) : undefined,
        semanticSummary: file.semanticSummary?.trim()
      }))
    };
  }

  private normalizeWhitespace(value: string): string {
    return value.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trimEnd() + "\n";
  }
}
