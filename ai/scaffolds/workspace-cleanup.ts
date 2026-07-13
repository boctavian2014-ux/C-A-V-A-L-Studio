import fs from 'node:fs';
import path from 'node:path';

import { detectFashionArchetype } from './fashion-matching/archetype';
import { isForbiddenUserWorkspacePath } from './workspace-forbidden-paths';
import {
  FASHION_WEB_CANONICAL_FILES,
  isFashionDuplicateScaffoldPath,
  isJunkScaffoldPath,
} from './workspace-rules';

export {
  FASHION_DUPLICATE_RULE,
  FASHION_TYPESCRIPT_RULE,
  USER_WORKSPACE_FORBIDDEN_RULE,
  isFashionDuplicateScaffoldPath,
  isJunkScaffoldPath,
} from './workspace-rules';

export interface WorkspaceRemediationResult {
  deleted: string[];
  created: string[];
  fixed: string[];
}

export interface FashionWebConsolidationResult {
  deleted: string[];
  created: string[];
  fixed: string[];
}

function joinRoot(workspaceRoot: string, relative: string): string {
  return path.join(workspaceRoot, relative.replace(/\//g, path.sep));
}

function deletePath(abs: string): boolean {
  try {
    if (!fs.existsSync(abs)) return false;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      fs.rmSync(abs, { recursive: true, force: true });
    } else {
      fs.unlinkSync(abs);
    }
    return true;
  } catch {
    return false;
  }
}

function deleteRelative(workspaceRoot: string, relative: string): boolean {
  return deletePath(joinRoot(workspaceRoot, relative));
}

function fileExists(workspaceRoot: string, relative: string): boolean {
  return fs.existsSync(joinRoot(workspaceRoot, relative));
}

function walkAndCollect(
  workspaceRoot: string,
  relativeDir: string,
  predicate: (rel: string) => boolean,
  out: string[]
): void {
  const abs = joinRoot(workspaceRoot, relativeDir);
  if (!fs.existsSync(abs)) return;
  const walk = (base: string, rel: string) => {
    for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      const childAbs = path.join(base, ent.name);
      if (ent.isDirectory()) {
        if (predicate(childRel)) {
          if (deletePath(childAbs)) out.push(childRel);
        } else {
          walk(childAbs, childRel);
        }
      } else if (predicate(childRel)) {
        if (deletePath(childAbs)) out.push(childRel);
      }
    }
  };
  walk(abs, relativeDir);
}

export function removeForbiddenPathsFromWorkspace(workspaceRoot: string): string[] {
  const deleted: string[] = [];
  for (const dir of ['src/zero-latency', 'cavallo_task_generator', 'zero-latency-composer']) {
    const abs = joinRoot(workspaceRoot, dir);
    if (deletePath(abs)) deleted.push(dir);
  }
  walkAndCollect(workspaceRoot, 'src', isForbiddenUserWorkspacePath, deleted);
  walkAndCollect(workspaceRoot, 'cavallo_task_generator', () => true, deleted);
  return [...new Set(deleted)];
}

export function removeScaffoldJunkFromWorkspace(workspaceRoot: string): string[] {
  const deleted: string[] = [];
  walkAndCollect(workspaceRoot, 'src', isJunkScaffoldPath, deleted);
  walkAndCollect(workspaceRoot, 'web/src', isFashionDuplicateScaffoldPath, deleted);
  for (const rel of ['.env_6', '.env_7', '.env_8']) {
    const abs = joinRoot(workspaceRoot, rel);
    if (deletePath(abs)) deleted.push(rel);
  }
  return [...new Set(deleted)];
}

const FASHION_WEB_TYPES = `export type { MatchItem, MatchResponse } from './api/matching';

export interface ImageUpload {
  file: File;
  previewUrl: string;
}

export type MatchResult = import('./api/matching').MatchItem;

export interface UploadResponse {
  request_id: string;
  matches: MatchResult[];
}

export interface Product {
  item_id: string;
  label: string;
  image_url?: string | null;
  brand?: string | null;
  price?: number | null;
}

export interface Outfit {
  id: string;
  items: Product[];
}

export interface OutfitMatch {
  score: number;
  reasons: string[];
}

export interface MatchingRequest {
  image_url: string;
  top_k?: number;
  threshold?: number;
}

export interface ApiError {
  message: string;
  code?: string;
}
`;

function isBrokenApiIndex(workspaceRoot: string): boolean {
  const indexPath = joinRoot(workspaceRoot, 'web/src/api/index.ts');
  if (!fs.existsSync(indexPath)) return false;
  try {
    const content = fs.readFileSync(indexPath, 'utf8');
    if (/from\s+['"]\.\/matching['"]/.test(content)) return false;
    if (/from\s+['"]\.\/api['"]/.test(content)) return true;
    return !/matching/.test(content);
  } catch {
    return true;
  }
}

const PAGE_DUPLICATE_PAIRS: Array<[string, string]> = [
  ['web/src/pages/HomePage.tsx', 'web/src/pages/Home.tsx'],
  ['web/src/pages/MatchPage.tsx', 'web/src/pages/Match.tsx'],
  ['web/src/pages/ResultsPage.tsx', 'web/src/pages/Results.tsx'],
  ['web/src/pages/AboutPage.tsx', 'web/src/pages/About.tsx'],
];

function fixFashionWebRootImports(workspaceRoot: string): string[] {
  const srcDir = joinRoot(workspaceRoot, 'web/src');
  if (!fs.existsSync(srcDir)) return [];
  const fixed: string[] = [];
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!ent.isFile() || !/\.(ts|tsx)$/.test(ent.name)) continue;
    const rel = `web/src/${ent.name}`;
    const abs = joinRoot(workspaceRoot, rel);
    let content = fs.readFileSync(abs, 'utf8');
    const next = content.replace(/from\s+(['"])\.\.\/types\1/g, 'from $1./types$1');
    if (next !== content) {
      fs.writeFileSync(abs, next, 'utf8');
      fixed.push(rel);
    }
  }
  return fixed;
}

function pruneNonCanonicalFashionWebFiles(workspaceRoot: string): string[] {
  const deleted: string[] = [];
  const webSrc = joinRoot(workspaceRoot, 'web/src');
  if (!fs.existsSync(webSrc)) return deleted;

  const walk = (dir: string, rel: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      const childAbs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(childAbs, childRel);
        try {
          if (fs.existsSync(childAbs) && fs.readdirSync(childAbs).length === 0) {
            if (deletePath(childAbs)) deleted.push(`web/src/${childRel}`);
          }
        } catch {
          /* ignore */
        }
      } else if (/\.(ts|tsx)$/.test(ent.name)) {
        const fullRel = `web/src/${childRel}`.replace(/\\/g, '/');
        if (!FASHION_WEB_CANONICAL_FILES.has(fullRel) && deletePath(childAbs)) {
          deleted.push(fullRel);
        }
      }
    }
  };
  walk(webSrc, '');
  return deleted;
}

/** Remove fashion-web duplicates and fix known bad import paths before typecheck. */
export function consolidateFashionWebWorkspace(workspaceRoot: string): FashionWebConsolidationResult {
  const deleted: string[] = [];
  const created: string[] = [];
  const fixed: string[] = [];

  if (!fileExists(workspaceRoot, 'web/package.json')) {
    return { deleted, created, fixed };
  }

  const hasCanonicalTypes = fileExists(workspaceRoot, 'web/src/types.ts');
  const hasCanonicalMatching = fileExists(workspaceRoot, 'web/src/api/matching.ts');

  if (hasCanonicalTypes) {
    const typesDir = joinRoot(workspaceRoot, 'web/src/types');
    if (fs.existsSync(typesDir)) {
      if (deletePath(typesDir)) deleted.push('web/src/types');
    }
  }

  if (hasCanonicalMatching) {
    for (const rel of ['web/src/api.ts', 'web/src/services/api.ts']) {
      if (deleteRelative(workspaceRoot, rel)) deleted.push(rel);
    }
    if (isBrokenApiIndex(workspaceRoot) && deleteRelative(workspaceRoot, 'web/src/api/index.ts')) {
      deleted.push('web/src/api/index.ts');
    }
  }

  const componentDuplicates: Array<[string, string]> = [
    ['web/src/components/MatchingResults.tsx', 'web/src/components/MatchResults.tsx'],
    ['web/src/components/ImageUploader.tsx', 'web/src/components/ImageUploadPanel.tsx'],
    ['web/src/components/ImageUpload.tsx', 'web/src/components/ImageUploadPanel.tsx'],
  ];
  for (const [dup, canonical] of componentDuplicates) {
    if (fileExists(workspaceRoot, canonical) && deleteRelative(workspaceRoot, dup)) {
      deleted.push(dup);
    }
  }

  for (const [dup, canonical] of PAGE_DUPLICATE_PAIRS) {
    if (fileExists(workspaceRoot, canonical) && deleteRelative(workspaceRoot, dup)) {
      deleted.push(dup);
    }
  }

  walkAndCollect(workspaceRoot, 'web/src', isFashionDuplicateScaffoldPath, deleted);
  deleted.push(...pruneNonCanonicalFashionWebFiles(workspaceRoot));
  fixed.push(...fixFashionWebRootImports(workspaceRoot));

  const typesPath = 'web/src/types.ts';
  if (!fileExists(workspaceRoot, typesPath) && hasCanonicalMatching) {
    const abs = joinRoot(workspaceRoot, typesPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, FASHION_WEB_TYPES, 'utf8');
    created.push(typesPath);
  }

  return {
    deleted: [...new Set(deleted)],
    created,
    fixed: [...new Set(fixed)],
  };
}

export function ensureFashionWebTypes(workspaceRoot: string): string | null {
  const typesPath = 'web/src/types.ts';
  const abs = joinRoot(workspaceRoot, typesPath);
  const webPkg = joinRoot(workspaceRoot, 'web/package.json');
  if (!fs.existsSync(webPkg)) return null;
  if (fs.existsSync(abs)) return null;
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abs, FASHION_WEB_TYPES, 'utf8');
  return typesPath;
}

export function remediateWorkspaceBeforeGate(
  workspaceRoot: string,
  userMessage: string
): WorkspaceRemediationResult {
  const deleted = [
    ...removeForbiddenPathsFromWorkspace(workspaceRoot),
    ...removeScaffoldJunkFromWorkspace(workspaceRoot),
  ];
  const created: string[] = [];
  const fixed: string[] = [];
  const archetype = detectFashionArchetype(userMessage);
  if (archetype === 'fashion-fullstack') {
    const consolidated = consolidateFashionWebWorkspace(workspaceRoot);
    deleted.push(...consolidated.deleted);
    created.push(...consolidated.created);
    fixed.push(...consolidated.fixed);
    const types = ensureFashionWebTypes(workspaceRoot);
    if (types) created.push(types);
  }
  return {
    deleted: [...new Set(deleted)],
    created: [...new Set(created)],
    fixed: [...new Set(fixed)],
  };
}
