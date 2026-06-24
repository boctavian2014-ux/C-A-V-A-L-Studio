import { AIClient } from "../ai-client";

export interface RefactorRequest {
  goal: string;
  operation: "rename_symbols" | "extract_functions" | "restructure_modules";
  files: string[];
  constraints: string[];
}

export class RefactorAgent {
  constructor(private readonly ai = new AIClient()) {}

  async propose(request: RefactorRequest): Promise<string> {
    const response = await this.ai.complete({
      capability: "code",
      intent: "multi_file",
      system: "Esti Caval Refactor. Pastreaza comportamentul, minimizeaza dif-ul si propune patch-uri reviewable.",
      prompt: request.goal,
      context: { ...request }
    });

    return response.content;
  }

  renameSymbols(symbols: Record<string, string>, files: string[]): Promise<string> {
    return this.propose({
      goal: `Rename symbols: ${JSON.stringify(symbols)}`,
      operation: "rename_symbols",
      files,
      constraints: ["Preserve public API unless explicitly requested.", "Update imports and references."]
    });
  }

  extractFunctions(files: string[], description: string): Promise<string> {
    return this.propose({
      goal: description,
      operation: "extract_functions",
      files,
      constraints: ["Extract only cohesive logic.", "Avoid premature abstraction."]
    });
  }

  restructureModules(files: string[], targetArchitecture: string): Promise<string> {
    return this.propose({
      goal: targetArchitecture,
      operation: "restructure_modules",
      files,
      constraints: ["Keep module boundaries explicit.", "Avoid circular dependencies."]
    });
  }
}
