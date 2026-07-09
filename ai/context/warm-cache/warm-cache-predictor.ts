import path from 'node:path';

import { warmCacheStore } from './warm-cache-store';
import type { WarmCachePrediction, WarmCacheReason } from './warm-cache-types';

const RELATED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.py'];

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'your', 'please',
  'este', 'sunt', 'pentru', 'care', 'face', 'unui', 'unei', 'implement', 'implementare',
  'exact', 'asa', 'astfel', 'prin', 'unde', 'cand', 'sau', 'dar', 'avem', 'face',
]);

function keywordsFromObjective(objective?: string): string[] {
  if (!objective?.trim()) return [];
  return objective
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9_./\u0103\u00e2\u00ee\u0219\u021b-]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 16);
}

function dependencyNeighbors(activeFile?: string): string[] {
  if (!activeFile) return [];
  const entry = warmCacheStore.get(activeFile);
  if (!entry) return [];
  const dir = path.dirname(activeFile);
  return entry.dependencies
    .map((edge) => {
      const target = edge.to;
      if (target.startsWith('.')) return path.normalize(path.join(dir, target));
      return target;
    })
    .filter((p) => !p.includes('node_modules'));
}

function filesMatchingKeywords(keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  const snap = warmCacheStore.snapshot();
  const hits: string[] = [];
  for (const entry of snap.entries) {
    const hay = [
      entry.path,
      entry.symbols.map((s) => s.name).join(' '),
      entry.semantic?.keywords?.join(' ') ?? '',
    ]
      .join(' ')
      .toLowerCase();
    if (keywords.some((kw) => hay.includes(kw))) hits.push(entry.path);
  }
  return hits;
}

export class WarmCachePredictor {
  predict(input: {
    workspaceRoot: string;
    activeFile?: string;
    openFiles?: string[];
    userAction?: string;
    objectiveDraft?: string;
  }): WarmCachePrediction {
    const files = new Set<string>();
    const openFiles = input.openFiles ?? [];

    for (const file of openFiles) files.add(file);

    if (input.activeFile) {
      files.add(input.activeFile);
      for (const related of this.relatedCandidates(input.activeFile)) files.add(related);
      for (const neighbor of dependencyNeighbors(input.activeFile)) files.add(neighbor);
    }

    const keywords = keywordsFromObjective(input.objectiveDraft);
    for (const hit of filesMatchingKeywords(keywords)) files.add(hit);

    const reason: WarmCacheReason =
      input.userAction === 'pipeline.start'
        ? 'pipeline'
        : input.userAction === 'file.open'
          ? 'file-open'
          : keywords.length > 0
            ? 'predictive'
            : 'predictive';

    const confidence =
      input.activeFile && (keywords.length > 0 || openFiles.length > 0)
        ? 0.85
        : input.activeFile
          ? 0.8
          : 0.45;

    return {
      files: Array.from(files),
      reason,
      confidence,
    };
  }

  private relatedCandidates(filePath: string): string[] {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    return RELATED_EXTENSIONS.map((candidateExt) => path.join(dir, `${base}${candidateExt}`));
  }
}

export const warmCachePredictor = new WarmCachePredictor();
