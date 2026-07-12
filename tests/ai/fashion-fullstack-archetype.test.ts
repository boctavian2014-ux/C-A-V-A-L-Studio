import { describe, expect, it } from 'vitest';
import {
  detectFashionArchetype,
  getCompletionChecklist,
} from '../../ai/scaffolds/fashion-matching/archetype';
import { getFashionFullStackScaffoldFiles } from '../../ai/scaffolds/fashion-matching/fullstack-manifest';

describe('fashion-fullstack archetype', () => {
  it('detects fullstack for haine production request', () => {
    expect(detectFashionArchetype('verifica si construieste pana la production proiectul haine')).toBe(
      'fashion-fullstack'
    );
    expect(detectFashionArchetype('fashion matching engine only')).toBe('engine-only');
  });

  it('detects mobile/web intent', () => {
    expect(detectFashionArchetype('fashion matching cu web ui si mobil expo')).toBe('fashion-fullstack');
  });

  it('fullstack checklist includes web and mobile', () => {
    const checklist = getCompletionChecklist('fashion-fullstack');
    const paths = checklist.map((c) => c.path);
    expect(paths).toContain('web/package.json');
    expect(paths).toContain('mobile/package.json');
    expect(paths).toContain('fashion-matching-engine/api/matching_routes.py');
  });

  it('fullstack manifest provides root package.json and API routes', () => {
    const files = getFashionFullStackScaffoldFiles();
    const paths = files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('fashion-matching-engine/api/matching_routes.py');
    expect(paths).toContain('mobile/src/screens/HomeScreen.tsx');
  });
});
