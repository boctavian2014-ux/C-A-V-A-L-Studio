import ts from "typescript";
import type { ComposerDiagnostic } from "../types";

export class SyntaxChecker {
  async check(files: Array<{ path: string; content: string }>): Promise<ComposerDiagnostic[]> {
    return files.flatMap((file) => this.checkFile(file.path, file.content));
  }

  private checkFile(filePath: string, content: string): ComposerDiagnostic[] {
    if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
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
    }

    if (/\.(py|go|rs|java)$/.test(filePath)) {
      const balanced = this.hasBalancedDelimiters(content);
      return balanced ? [] : [{ level: "warning", source: "syntax-checker", file: filePath, message: "Basic delimiter check failed. Use language toolchain for full validation." }];
    }

    return [];
  }

  private hasBalancedDelimiters(content: string): boolean {
    const stack: string[] = [];
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
    for (const char of content) {
      if (pairs[char]) stack.push(pairs[char]);
      else if ([")", "]", "}"].includes(char) && stack.pop() !== char) return false;
    }
    return stack.length === 0;
  }
}
