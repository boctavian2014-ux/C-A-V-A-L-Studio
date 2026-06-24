import { AIContextService } from "../../get-context";
import { RelevantFileService } from "../../get-relevant-files";
import { SymbolIndexService } from "../../get-symbols";
import type { ComposerContext } from "../types";

export class ContextExpander {
  constructor(
    private readonly contextService = new AIContextService(),
    private readonly relevantFiles = new RelevantFileService(),
    private readonly symbols = new SymbolIndexService()
  ) {}

  async expand(objective: string, workspaceRoot: string, limit = 16): Promise<ComposerContext> {
    await this.contextService.prepareWorkspace(workspaceRoot);
    await this.relevantFiles.prepare(workspaceRoot);
    const contextBundle = await this.contextService.getContext(objective, limit);
    const files = (await this.relevantFiles.find(objective, limit)).map((file) => file.path);
    const symbolMatches = await this.symbols.getSymbols(workspaceRoot, files).catch(() => []);
    const imports = contextBundle.dependencyGraph
      .filter((edge) => files.includes(edge.from) || files.includes(edge.to))
      .map((edge) => `${edge.from} -> ${edge.to}`);

    return {
      objective,
      workspaceRoot,
      relevantFiles: files,
      symbols: symbolMatches,
      contextBundle,
      notes: [
        `Relevant files: ${files.length}`,
        `Symbols: ${symbolMatches.length}`,
        `Imports/exports edges: ${imports.length}`,
        ...imports.slice(0, 20)
      ]
    };
  }
}
