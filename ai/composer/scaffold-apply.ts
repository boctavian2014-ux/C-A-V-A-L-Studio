import {
  parseScaffoldFiles,
  isScaffoldFragment,
  isBlockedScaffoldPath,
  isJunkCodeFileContent,
  repairScaffoldComposerExport,
  type ParsedScaffoldFile,
} from "./scaffold-parser";
import { sortScaffoldFiles } from "./scaffold-order";
import { joinWorkspaceRelativePath } from "./written-files";

export interface ScaffoldApplyResult {
  written: string[];
  errors: string[];
  /** How many fences were skipped as blocked/junk/fragment (not write failures). */
  skipped: number;
}

export async function applyScaffoldToWorkspace(
  projectPath: string,
  files: ParsedScaffoldFile[]
): Promise<ScaffoldApplyResult> {
  const caval = window.caval;
  if (!caval?.fs?.writeFile) {
    return { written: [], errors: ["IPC filesystem unavailable"], skipped: 0 };
  }

  const sync = await caval.workspaceSync?.(projectPath);
  if (sync && sync.ok === false) {
    return {
      written: [],
      errors: [sync.error ?? "Workspace sync failed — reopen the folder (File → Open Folder)."],
      skipped: 0,
    };
  }

  const written: string[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const mkdirDone = new Set<string>();

  for (const file of sortScaffoldFiles(files)) {
    if (
      isBlockedScaffoldPath(file.path) ||
      isScaffoldFragment(file.content) ||
      isJunkCodeFileContent(file.path, file.content)
    ) {
      skipped += 1;
      continue;
    }

    const content = repairScaffoldComposerExport(file.path, file.content);
    const rel = file.path.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    const abs = joinWorkspaceRelativePath(projectPath, rel);
    const slash = rel.lastIndexOf("/");
    const dirRel = slash > 0 ? rel.slice(0, slash) : "";
    if (dirRel && !mkdirDone.has(dirRel) && caval.fs.createDir) {
      const dirAbs = joinWorkspaceRelativePath(projectPath, dirRel);
      const dirRes = await caval.fs.createDir(dirAbs);
      if (dirRes.ok) mkdirDone.add(dirRel);
      else if (dirRes.error) errors.push(`${dirRel}: ${dirRes.error}`);
    }

    const res = await caval.fs.writeFile(abs, content);
    if (res.ok) written.push(rel);
    else errors.push(`${rel}: ${res.error ?? "write failed"}`);
  }

  return { written, errors, skipped };
}

export { parseScaffoldFiles };
