import { parseScaffoldFiles, type ParsedScaffoldFile } from './scaffold-parser';

function joinWorkspace(root: string, relative: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const clean = relative.replace(/^[/\\]+/, '').replace(/\//g, sep);
  return `${root}${sep}${clean}`;
}

function parentDir(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/';
  const idx = filePath.lastIndexOf(sep);
  return idx > 0 ? filePath.slice(0, idx) : filePath;
}

export async function applyScaffoldToWorkspace(
  projectPath: string,
  files: ParsedScaffoldFile[]
): Promise<string[]> {
  const caval = window.caval;
  if (!caval?.fs?.writeFile) return [];

  const written: string[] = [];
  const mkdirDone = new Set<string>();

  for (const file of files) {
    const abs = joinWorkspace(projectPath, file.path);
    const dir = parentDir(abs);
    if (!mkdirDone.has(dir) && caval.fs.createDir) {
      await caval.fs.createDir(dir);
      mkdirDone.add(dir);
    }
    const res = await caval.fs.writeFile(abs, file.content);
    if (res.ok) written.push(file.path);
  }

  return written;
}

export { parseScaffoldFiles };
