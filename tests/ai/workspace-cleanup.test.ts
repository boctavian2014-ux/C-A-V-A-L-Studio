import fs from 'node:fs';

import os from 'node:os';

import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';



import {

  consolidateFashionWebWorkspace,

  ensureFashionWebTypes,

  isJunkScaffoldPath,

  remediateWorkspaceBeforeGate,

  removeForbiddenPathsFromWorkspace,

  removeScaffoldJunkFromWorkspace,

} from '../../ai/scaffolds/workspace-cleanup';

import { isFashionDuplicateScaffoldPath } from '../../ai/scaffolds/workspace-rules';



describe('workspace-cleanup', () => {

  const roots: string[] = [];



  afterEach(() => {

    for (const root of roots) {

      fs.rmSync(root, { recursive: true, force: true });

    }

    roots.length = 0;

  });



  it('detects junk scaffold paths', () => {

    expect(isJunkScaffoldPath('src/file9.txt')).toBe(true);

    expect(isJunkScaffoldPath('src/main_7.sh')).toBe(true);

    expect(isJunkScaffoldPath('src/components/App.tsx')).toBe(false);

  });



  it('detects fashion duplicate scaffold paths', () => {

    expect(isFashionDuplicateScaffoldPath('web/src/types/index.ts')).toBe(true);

    expect(isFashionDuplicateScaffoldPath('web/src/api.ts')).toBe(true);

    expect(isFashionDuplicateScaffoldPath('web/src/components/MatchingResults.tsx')).toBe(true);

    expect(isFashionDuplicateScaffoldPath('web/src/components/MatchResults.tsx')).toBe(false);

    expect(isFashionDuplicateScaffoldPath('web/src/hooks/useMatch.ts')).toBe(false);

    expect(isFashionDuplicateScaffoldPath('web/src/pages/Home.tsx')).toBe(false);

  });



  it('removes forbidden directories and junk files', () => {

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-cleanup-'));

    roots.push(root);



    const zl = path.join(root, 'src', 'zero-latency');

    fs.mkdirSync(zl, { recursive: true });

    fs.writeFileSync(path.join(zl, 'cache.ts'), 'export {}');

    fs.writeFileSync(path.join(root, 'src', 'file1.txt'), 'junk');

    fs.mkdirSync(path.join(root, 'cavallo_task_generator'), { recursive: true });

    fs.writeFileSync(path.join(root, 'cavallo_task_generator', 'core.py'), 'pass');



    const forbidden = removeForbiddenPathsFromWorkspace(root);

    const junk = removeScaffoldJunkFromWorkspace(root);



    expect(forbidden.some((p) => p.includes('zero-latency'))).toBe(true);

    expect(junk).toContain('src/file1.txt');

    expect(fs.existsSync(zl)).toBe(false);

    expect(fs.existsSync(path.join(root, 'src', 'file1.txt'))).toBe(false);

  });



  it('seeds web/src/types.ts for fashion-fullstack when missing', () => {

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-cleanup-'));

    roots.push(root);



    fs.mkdirSync(path.join(root, 'web', 'src', 'api'), { recursive: true });

    fs.writeFileSync(

      path.join(root, 'web', 'package.json'),

      JSON.stringify({ name: 'haine-web' })

    );

    fs.writeFileSync(

      path.join(root, 'web', 'src', 'api', 'matching.ts'),

      'export type MatchItem = { item_id: string };'

    );



    const created = ensureFashionWebTypes(root);

    expect(created).toBe('web/src/types.ts');

    expect(fs.existsSync(path.join(root, 'web', 'src', 'types.ts'))).toBe(true);

    const content = fs.readFileSync(path.join(root, 'web', 'src', 'types.ts'), 'utf8');

    expect(content).toContain('ImageUpload');

    expect(content).toContain('MatchResult');

  });



  it('consolidates fashion-web duplicates like haine project', () => {

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-fashion-'));

    roots.push(root);



    const webSrc = path.join(root, 'web', 'src');

    fs.mkdirSync(path.join(webSrc, 'api'), { recursive: true });

    fs.mkdirSync(path.join(webSrc, 'types'), { recursive: true });

    fs.mkdirSync(path.join(webSrc, 'components'), { recursive: true });

    fs.writeFileSync(path.join(root, 'web', 'package.json'), JSON.stringify({ name: 'haine-web' }));

    fs.writeFileSync(

      path.join(webSrc, 'api', 'matching.ts'),

      'export type MatchItem = { item_id: string; label: string; score: number };'

    );

    fs.writeFileSync(path.join(webSrc, 'types.ts'), "export type { MatchItem } from './api/matching';\n");

    fs.writeFileSync(path.join(webSrc, 'types', 'index.ts'), 'export interface MatchResult { id: string }\n');

    fs.writeFileSync(

      path.join(webSrc, 'api.ts'),

      "import { Product } from '../types'\nexport {}\n"

    );

    fs.writeFileSync(path.join(webSrc, 'api', 'index.ts'), "export { api } from './api';\n");

    fs.writeFileSync(path.join(webSrc, 'components', 'MatchResults.tsx'), 'export function MatchResults() { return null }\n');

    fs.writeFileSync(path.join(webSrc, 'components', 'MatchingResults.tsx'), 'export function MatchingResults() { return null }\n');



    const result = consolidateFashionWebWorkspace(root);



    expect(result.deleted).toContain('web/src/types');

    expect(result.deleted).toContain('web/src/api.ts');

    expect(result.deleted).toContain('web/src/api/index.ts');

    expect(result.deleted).toContain('web/src/components/MatchingResults.tsx');

    expect(fs.existsSync(path.join(webSrc, 'types', 'index.ts'))).toBe(false);

    expect(fs.existsSync(path.join(webSrc, 'api.ts'))).toBe(false);

    expect(fs.existsSync(path.join(webSrc, 'components', 'MatchResults.tsx'))).toBe(true);

  });



  it('remediateWorkspaceBeforeGate combines cleanup and type seed', () => {

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-cleanup-'));

    roots.push(root);



    fs.mkdirSync(path.join(root, 'src', 'zero-latency'), { recursive: true });

    fs.writeFileSync(path.join(root, 'src', 'file2.txt'), 'x');

    fs.mkdirSync(path.join(root, 'web', 'src'), { recursive: true });

    fs.writeFileSync(path.join(root, 'web', 'package.json'), '{}');



    const result = remediateWorkspaceBeforeGate(root, 'build fashion web mobile production');

    expect(result.deleted.length).toBeGreaterThan(0);

    expect(result.created).toContain('web/src/types.ts');

  });

});


