import * as fs from "fs";
import * as path from "path";

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  "__pycache__",
  ".DS_Store",
  "coverage",
  ".turbo",
  ".cache",
]);

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  ext?: string;
  children?: FileNode[];
}

export function readDirTree(dirPath: string, rootPath: string, depth = 0): FileNode[] {
  if (depth > 8) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(rootPath, fullPath);

      if (entry.isDirectory()) {
        nodes.push({
          id: relPath,
          name: entry.name,
          path: fullPath,
          type: "directory",
          children: readDirTree(fullPath, rootPath, depth + 1),
        });
      } else {
        const ext = path.extname(entry.name).slice(1);
        nodes.push({
          id: relPath,
          name: entry.name,
          path: fullPath,
          type: "file",
          ext,
        });
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}
