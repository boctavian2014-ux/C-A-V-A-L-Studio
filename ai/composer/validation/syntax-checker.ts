import type { ComposerDiagnostic } from "../types";

export class SyntaxChecker {
  async check(files: Array<{ path: string; content: string }>): Promise<ComposerDiagnostic[]> {
    const batches = await Promise.all(
      files.map((file) => this.checkFile(file.path, file.content))
    );
    return batches.flat();
  }

  private async checkFile(filePath: string, content: string): Promise<ComposerDiagnostic[]> {
    if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
      return this.checkTypeScript(filePath, content);
    }

    if (/\.(py|go|rs|java)$/.test(filePath)) {
      const balanced = this.hasBalancedDelimiters(content);
      return balanced ? [] : [{ level: "warning", source: "syntax-checker", file: filePath, message: "Basic delimiter check failed. Use language toolchain for full validation." }];
    }

    return [];
  }

  private async checkTypeScript(filePath: string, content: string): Promise<ComposerDiagnostic[]> {
    try {
      const ts = await import("typescript");
      const output = ts.transpileModule(content, {
        compilerOptions: { module: ts.ModuleKind.Node16, target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
        fileName: filePath
      });
      return (output.diagnostics ?? []).map((diagnostic) => ({
        level: "error" as const,
        source: "syntax-checker",
        file: filePath,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      }));
    } catch {
      return [];
    }
  }

  private hasBalancedDelimiters(content: string): boolean {
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
    const stack: string[] = [];
    for (const ch of content) {
      if (ch in pairs) stack.push(pairs[ch]!);
      else if (Object.values(pairs).includes(ch)) {
        if (stack.pop() !== ch) return false;
      }
    }
    return stack.length === 0;
  }
}
