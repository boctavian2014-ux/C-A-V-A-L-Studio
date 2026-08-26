import fs from "node:fs/promises";
import path from "node:path";

import {
  isInternalWorkspaceDirName,
  isInternalWorkspacePath,
  isInternalWorkspaceRoot,
  pickWorkspaceStartupFile,
} from "../shared/internal-workspace-paths";
import { languageFromRelativePath } from "./path-security";

export type ListedWorkspaceFile = {
  path: string;
  label: string;
  language: string;
  content: string;
};

const TEXT_FILE = /\.(ts|tsx|js|jsx|json|md|css|html|py|go|rs|java|txt)$/i;

/**
 * Walk a workspace for editor/preload files. Skips internal cache dirs so
 * `.caval/context-cache/documents.json` cannot become files[0].
 */
export async function listFolderFiles(
  folderPath: string,
  limit = 80,
  preferredFilePath?: string
): Promise<ListedWorkspaceFile[]> {
  if (isInternalWorkspaceRoot(folderPath)) return [];

  const files: ListedWorkspaceFile[] = [];

  const walk = async (dir: string): Promise<void> => {
    if (files.length >= limit) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (isInternalWorkspaceDirName(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (TEXT_FILE.test(entry.name)) {
        const label = path.relative(folderPath, fullPath);
        if (isInternalWorkspacePath(label, folderPath)) continue;
        files.push({
          path: fullPath,
          label,
          language: languageFromRelativePath(label),
          content: await fs.readFile(fullPath, "utf8").catch(() => ""),
        });
      }
    }
  };

  await walk(folderPath);

  const preferredIsUserFile =
    Boolean(preferredFilePath) && !isInternalWorkspacePath(preferredFilePath ?? "", folderPath);

  if (preferredIsUserFile && preferredFilePath) {
    return files.sort((left, right) => {
      if (left.path === preferredFilePath) return -1;
      if (right.path === preferredFilePath) return 1;
      return left.label.localeCompare(right.label);
    });
  }

  const startup = pickWorkspaceStartupFile(files);
  if (!startup) return files;
  return [startup, ...files.filter((file) => file.path !== startup.path)];
}
