import fs from "node:fs/promises";
import path from "node:path";

export interface SymbolMatch {
  name: string;
  kind: "class" | "function" | "interface" | "type" | "const";
  file: string;
  line: number;
}

const symbolPattern = /\b(class|function|interface|type|const)\s+([A-Za-z_$][\w$]*)/g;

export class SymbolIndexService {
  async getSymbols(rootDir: string, files: string[]): Promise<SymbolMatch[]> {
    const matches: SymbolMatch[] = [];

    for (const file of files) {
      const fullPath = path.resolve(rootDir, file);
      const text = await fs.readFile(fullPath, "utf8");
      const lines = text.split(/\r?\n/);

      lines.forEach((line, index) => {
        let match: RegExpExecArray | null;
        while ((match = symbolPattern.exec(line)) !== null) {
          matches.push({
            kind: match[1] as SymbolMatch["kind"],
            name: match[2],
            file,
            line: index + 1
          });
        }
      });
    }

    return matches;
  }
}
