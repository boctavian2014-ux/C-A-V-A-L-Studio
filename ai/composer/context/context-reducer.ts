import type { ComposerContext } from "../types";

export class ContextReducer {
  reduce(context: ComposerContext, maxFiles = 12, maxSymbols = 120): ComposerContext {
    const relevantFiles = context.relevantFiles.slice(0, maxFiles);
    const symbols = context.symbols
      .filter((symbol) => relevantFiles.includes(symbol.file))
      .slice(0, maxSymbols);

    return {
      ...context,
      relevantFiles,
      symbols,
      notes: [
        ...context.notes,
        `Reduced context to ${relevantFiles.length} files and ${symbols.length} symbols.`
      ]
    };
  }
}
