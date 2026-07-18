import {

  parseScaffoldFiles,

  isScaffoldFragment,

  isBlockedScaffoldPath,

  isJunkCodeFileContent,

  repairScaffoldComposerExport,

  type ParsedScaffoldFile,

} from './scaffold-parser';

import { sortScaffoldFiles } from './scaffold-order';



export interface ScaffoldApplyResult {

  written: string[];

  errors: string[];

}



export async function applyScaffoldToWorkspace(

  projectPath: string,

  files: ParsedScaffoldFile[]

): Promise<ScaffoldApplyResult> {

  const caval = window.caval;

  if (!caval?.fs?.writeFile) {

    return { written: [], errors: ['IPC filesystem unavailable'] };

  }



  await caval.workspaceSync?.(projectPath);



  const written: string[] = [];

  const errors: string[] = [];

  const mkdirDone = new Set<string>();



  for (const file of sortScaffoldFiles(files)) {

    if (

      isBlockedScaffoldPath(file.path) ||

      isScaffoldFragment(file.content) ||

      isJunkCodeFileContent(file.path, file.content)

    ) {

      continue;

    }

    const content = repairScaffoldComposerExport(file.path, file.content);

    const rel = file.path.replace(/^[/\\]+/, '').replace(/\\/g, '/');

    const slash = rel.lastIndexOf('/');

    const dir = slash > 0 ? rel.slice(0, slash) : '';

    if (dir && !mkdirDone.has(dir) && caval.fs.createDir) {

      const dirRes = await caval.fs.createDir(dir);

      if (dirRes.ok) mkdirDone.add(dir);

      else if (dirRes.error) errors.push(`${dir}: ${dirRes.error}`);

    }

    const res = await caval.fs.writeFile(rel, content);

    if (res.ok) written.push(rel);

    else errors.push(`${rel}: ${res.error ?? 'write failed'}`);

  }



  return { written, errors };

}



export { parseScaffoldFiles };


