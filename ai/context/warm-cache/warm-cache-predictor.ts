import path from "node:path";

import type { WarmCachePrediction, WarmCacheReason } from "./warm-cache-types";

const RELATED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".md"];

export class WarmCachePredictor {
  predict(input: {
    workspaceRoot: string;
    activeFile?: string;
    openFiles?: string[];
    userAction?: string;
  }): WarmCachePrediction {
    const files = new Set<string>();
    for (const file of input.openFiles ?? []) files.add(file);
    if (input.activeFile) {
      files.add(input.activeFile);
      for (const related of this.relatedCandidates(input.activeFile)) files.add(related);
    }

    const reason: WarmCacheReason =
      input.userAction === "pipeline.start"
        ? "pipeline"
        : input.userAction === "file.open"
          ? "file-open"
          : "predictive";

    return {
      files: Array.from(files),
      reason,
      confidence: input.activeFile ? 0.8 : 0.45,
    };
  }

  private relatedCandidates(filePath: string): string[] {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    return RELATED_EXTENSIONS.map((candidateExt) => path.join(dir, `${base}${candidateExt}`));
  }
}

export const warmCachePredictor = new WarmCachePredictor();
