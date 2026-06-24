import type { ComposerContext } from "../types";

export class ContextMerger {
  merge(primary: ComposerContext, ...sources: Partial<ComposerContext>[]): ComposerContext {
    const files = new Set(primary.relevantFiles);
    const symbols = [...primary.symbols];
    const notes = [...primary.notes];

    for (const source of sources) {
      source.relevantFiles?.forEach((file) => files.add(file));
      source.symbols?.forEach((symbol) => {
        if (!symbols.some((existing) => existing.file === symbol.file && existing.name === symbol.name && existing.line === symbol.line)) {
          symbols.push(symbol);
        }
      });
      if (source.notes) {
        notes.push(...source.notes);
      }
    }

    return {
      ...primary,
      relevantFiles: [...files],
      symbols,
      notes
    };
  }
}
