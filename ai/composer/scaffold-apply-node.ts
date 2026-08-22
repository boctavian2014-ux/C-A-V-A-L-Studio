import fs from 'node:fs';
import path from 'node:path';

import type { ProposedWrite } from '../../src/shared/ai-chat-apply-contract';
import { normalizeProposedPath, sanitizeProposedContent } from '../../src/shared/ai-chat-apply-contract';
import { parseScaffoldFiles, isScaffoldFragment } from './scaffold-parser';
import { sortScaffoldFiles } from './scaffold-order';
import type { PipelineContextStore } from './multi-agent/pipeline-context-store';
import { stageProposedWrites } from '../../src/main/ai/proposed-writes-buffer';

function joinWorkspace(root: string, relative: string): string {
  const clean = relative.replace(/^[/\\]+/, '').replace(/\//g, path.sep);
  return path.join(root, clean);
}

/** Build proposed writes from scaffold fences — does not touch disk. */
export function proposeScaffoldWrites(workspaceRoot: string, content: string): ProposedWrite[] {
  if (!workspaceRoot?.trim() || !content.trim()) return [];

  const files = sortScaffoldFiles(parseScaffoldFiles(content));
  const proposed: ProposedWrite[] = [];

  for (const file of files) {
    if (isScaffoldFragment(file.content)) continue;
    const rel = normalizeProposedPath(file.path);
    if (!rel) continue;
    const abs = joinWorkspace(workspaceRoot, rel);
    let previousContent: string | undefined;
    let isNew = true;
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        previousContent = fs.readFileSync(abs, 'utf8');
        isNew = false;
      }
    } catch {
      previousContent = undefined;
      isNew = true;
    }
    proposed.push({
      path: rel,
      content: sanitizeProposedContent(file.content),
      isNew,
      ...(previousContent != null ? { previousContent: sanitizeProposedContent(previousContent) } : {}),
    });
  }

  return proposed;
}

/** Write parsed scaffold files to workspace (main process) — used after Accept. */
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

/** Apply already-sanitized proposed writes to disk. Returns applied relative paths. */
export function applyProposedWritesToDisk(
  workspaceRoot: string,
  writes: ProposedWrite[]
): { applied: string[]; errors: string[] } {
  const applied: string[] = [];
  const errors: string[] = [];
  if (!workspaceRoot?.trim()) {
    return { applied, errors: ['No workspace'] };
  }
  for (const write of writes) {
    const rel = normalizeProposedPath(write.path);
    if (!rel) {
      errors.push('Invalid path');
      continue;
    }
    try {
      const abs = joinWorkspace(workspaceRoot, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, write.content, 'utf8');
      applied.push(rel);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { applied, errors };
}

/** Delete files that were created as new proposals (Revert for new files). */
export function revertNewProposedWrites(
  workspaceRoot: string,
  writes: ProposedWrite[]
): { deleted: string[]; errors: string[] } {
  const deleted: string[] = [];
  const errors: string[] = [];
  for (const write of writes) {
    if (!write.isNew) continue;
    const rel = normalizeProposedPath(write.path);
    if (!rel) continue;
    try {
      const abs = joinWorkspace(workspaceRoot, rel);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        fs.unlinkSync(abs);
        deleted.push(rel);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { deleted, errors };
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

/**
 * Pas 6.4 — propose scaffold writes (no disk). Stages into buffer when stageKey provided.
 * Returns relative paths for pipeline bookkeeping (same shape as legacy writtenFiles).
 */
export function applyPipelineScaffold(
  workspaceRoot: string,
  composeText: string,
  store: PipelineContextStore,
  options?: { stageKey?: string; defer?: boolean }
): string[] {
  const content = collectPipelineScaffoldContent(composeText, store);
  const defer = options?.defer !== false; // default defer (6.4)
  if (!defer) {
    return applyScaffoldToWorkspaceNode(workspaceRoot, content);
  }
  const proposed = proposeScaffoldWrites(workspaceRoot, content);
  if (options?.stageKey) {
    stageProposedWrites(options.stageKey, proposed);
  }
  return proposed.map((w) => w.path);
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
