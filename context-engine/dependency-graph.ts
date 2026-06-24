import path from "node:path";
import type { IndexedDocument } from "./types";

export interface DependencyEdge {
  from: string;
  to: string;
  kind: "import" | "require";
}

export class DependencyGraph {
  build(documents: IndexedDocument[]): DependencyEdge[] {
    return documents.flatMap((document) => this.extractEdges(document));
  }

  private extractEdges(document: IndexedDocument): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    const text = document.chunks.map((chunk) => chunk.text).join("\n");
    const importRegex = /import\s+(?:.+?\s+from\s+)?["'](.+?)["']|require\(["'](.+?)["']\)/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(text)) !== null) {
      const target = match[1] ?? match[2];
      edges.push({
        from: document.path,
        to: this.normalizeTarget(document.path, target),
        kind: match[1] ? "import" : "require"
      });
    }

    return edges;
  }

  private normalizeTarget(from: string, target: string): string {
    if (!target.startsWith(".")) {
      return target;
    }

    return path.normalize(path.join(path.dirname(from), target));
  }
}
