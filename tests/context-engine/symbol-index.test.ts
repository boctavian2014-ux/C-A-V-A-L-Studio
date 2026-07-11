import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractSymbolsFromSource,
  findSymbolDefinition,
  findSymbolReferences,
  findTextReferencesInWorkspace,
} from "../../context-engine/symbol-index";
describe("symbol-index", () => {
  const source = `
export function greet(name: string) {
  return name;
}

export class Greeter {
  hi() {}
}

const VERSION = '1';
`;

  it("extractSymbolsFromSource finds functions and classes", () => {
    const symbols = extractSymbolsFromSource("src/a.ts", source);
    expect(symbols.map((s) => s.name)).toEqual(expect.arrayContaining(["greet", "Greeter", "VERSION"]));
  });

  it("findSymbolDefinition prefers preferred file", () => {
    const symbols = extractSymbolsFromSource("a.ts", source);
    const def = findSymbolDefinition(symbols, "greet", "a.ts");
    expect(def?.kind).toBe("function");
    expect(def?.line).toBeGreaterThan(0);
  });

  it("findSymbolReferences returns all matches", () => {
    const symbols = [
      ...extractSymbolsFromSource("a.ts", "export const x = 1;"),
      ...extractSymbolsFromSource("b.ts", "import { x } from './a';"),
    ];
    expect(findSymbolReferences(symbols, "x").length).toBeGreaterThanOrEqual(1);
  });

  it("findTextReferencesInWorkspace scans usages", async () => {
    const root = path.join(os.tmpdir(), `caval-refs-${Date.now()}`);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, "a.ts"), "export const greet = 1;\n", "utf8");
    await fs.writeFile(path.join(root, "b.ts"), "import { greet } from './a';\nconsole.log(greet);\n", "utf8");
    const hits = await findTextReferencesInWorkspace(root, "greet", 20);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
