export type FashionProjectArchetype = 'engine-only' | 'fashion-fullstack';

export interface ArchetypeChecklistItem {
  id: string;
  path: string;
  description: string;
}

export function detectFashionArchetype(text: string): FashionProjectArchetype {
  const t = text.toLowerCase();
  const wantsUi =
    /\b(web|ui|frontend|react|vite|interfa[tț][aă]|upload|pagin[aă])\b/i.test(t) ||
    /\b(mobil|mobile|expo|android|ios|telefon)\b/i.test(t);
  const wantsProduction =
    /\b(production|prod|gata de lansare|lansare|deploy)\b/i.test(t) ||
    /\b(verifica|construieste|construie[sș]te|completeaz[aă])\b/i.test(t);

  if (wantsUi || wantsProduction) return 'fashion-fullstack';
  return 'engine-only';
}

export function getCompletionChecklist(archetype: FashionProjectArchetype): ArchetypeChecklistItem[] {
  const engine: ArchetypeChecklistItem[] = [
    {
      id: 'fme-api',
      path: 'fashion-matching-engine/api/main.py',
      description: 'FastAPI entry with health + matching routes',
    },
    {
      id: 'fme-match',
      path: 'fashion-matching-engine/api/matching_routes.py',
      description: 'POST /api/v1/matching/match and match/upload',
    },
  ];

  if (archetype === 'engine-only') return engine;

  return [
    ...engine,
    {
      id: 'root-pkg',
      path: 'package.json',
      description: 'Root monorepo scripts (dev, api, build)',
    },
    {
      id: 'web-app',
      path: 'web/package.json',
      description: 'React web UI with Vite',
    },
    {
      id: 'web-upload',
      path: 'web/src/components/ImageUploadPanel.tsx',
      description: 'Image upload + match UI',
    },
    {
      id: 'mobile-app',
      path: 'mobile/package.json',
      description: 'Expo mobile app (standalone install)',
    },
    {
      id: 'mobile-screen',
      path: 'mobile/src/screens/HomeScreen.tsx',
      description: 'Camera/gallery pick + match',
    },
  ];
}

export function checklistMissingPaths(
  checklist: ArchetypeChecklistItem[],
  fileExists: (relativePath: string) => boolean
): ArchetypeChecklistItem[] {
  return checklist.filter((item) => !fileExists(item.path));
}
