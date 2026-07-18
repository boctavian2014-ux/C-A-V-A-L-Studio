import fs from 'node:fs';
import path from 'node:path';

import { parseScaffoldFiles, isScaffoldFragment } from './scaffold-parser';
import { sortScaffoldFiles } from './scaffold-order';
import type { PipelineContextStore } from './multi-agent/pipeline-context-store';

function joinWorkspace(root: string, relative: string): string {
  const clean = relative.replace(/^[/\\]+/, '').replace(/\//g, path.sep);
  return path.join(root, clean);
}

/** Write parsed scaffold files to workspace (main process). */
export function applyScaffoldToWorkspaceNode(workspaceRoot: string, content: string): string[] {
  if (!workspaceRoot?.trim() || !content.trim()) return [];

  const files = sortScaffoldFiles(parseScaffoldFiles(content));
  const written: string[] = [];

  for (const file of files) {
    if (isScaffoldFragment(file.content)) continue;
    const abs = joinWorkspace(workspaceRoot, file.path);
    const dir = path.dirname(abs);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(abs, file.content, 'utf8');
    written.push(file.path.replace(/^[/\\]+/, '').replace(/\\/g, '/'));
  }

  return written;
}

/** Gather compose + sub-agent + merge outputs that may contain ```lang:path``` fences. */
export function collectPipelineScaffoldContent(
  composeText: string,
  store: PipelineContextStore
): string {
  const parts: string[] = [];
  if (composeText.trim()) parts.push(composeText);

  for (const task of store.getTasks()) {
    const out = store.getSubAgentOutput(task.id);
    if (out?.includes('```')) parts.push(out);
  }

  const mergeRaw = store.getMergeRaw();
  if (mergeRaw?.includes('```')) parts.push(mergeRaw);

  return parts.join('\n\n');
}

export function applyPipelineScaffold(
  workspaceRoot: string,
  composeText: string,
  store: PipelineContextStore
): string[] {
  const content = collectPipelineScaffoldContent(composeText, store);
  return applyScaffoldToWorkspaceNode(workspaceRoot, content);
}

/** Persist parse diagnostics when compose had fences but nothing was written. */
export function writeScaffoldDiagnostics(
  workspaceRoot: string,
  runId: string,
  composeText: string,
  store: PipelineContextStore,
  writtenFiles: string[]
): void {
  if (writtenFiles.length > 0 || !workspaceRoot?.trim() || !runId) return;
  const content = collectPipelineScaffoldContent(composeText, store);
  const fencePairs = Math.floor((content.match(/```/g)?.length ?? 0) / 2);
  if (fencePairs < 1) return;

  const parsed = parseScaffoldFiles(content);
  const dir = path.join(workspaceRoot, '.cavalo', 'pipeline', runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'write-debug.json'),
    JSON.stringify(
      {
        fencePairs,
        parsedCount: parsed.length,
        parsedPaths: parsed.map((f) => f.path).slice(0, 30),
        composeFencePairs: Math.floor((composeText.match(/```/g)?.length ?? 0) / 2),
      },
      null,
      2
    )
  );
}
