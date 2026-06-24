import { AIContextService } from "./get-context";

export interface RelevantFile {
  path: string;
  score: number;
  reason: string;
}

export class RelevantFileService {
  constructor(private readonly context = new AIContextService()) {}

  async prepare(rootDir: string): Promise<void> {
    await this.context.prepareWorkspace(rootDir);
  }

  async find(query: string, limit = 10): Promise<RelevantFile[]> {
    const bundle = await this.context.getContext(query, limit * 2);
    const byPath = new Map<string, RelevantFile>();

    for (const result of bundle.semanticResults) {
      const filePath = result.chunk.path ?? result.chunk.documentId;
      const current = byPath.get(filePath);
      if (!current || result.score > current.score) {
        byPath.set(filePath, {
          path: filePath,
          score: result.score,
          reason: `semantic match lines ${result.chunk.startLine}-${result.chunk.endLine}`
        });
      }
    }

    return [...byPath.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
