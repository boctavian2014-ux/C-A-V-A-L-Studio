/** Prompt rules and path heuristics safe for renderer + main (no Node.js fs). */

import { normalizeWorkspacePath } from './workspace-forbidden-paths';

/** Placeholder / spam paths models emit instead of real modules. */
const JUNK_SCAFFOLD_PATH_RE =
  /^(?:src\/file\d+\.|src\/main_\d+\.|\.env_\d+$|src\/main\.txt$|src\/app\.js$)/i;

/** Compose duplicates that conflict with fashion-fullstack seed modules. */
const FASHION_DUPLICATE_EXACT = new Set([
  'web/src/types/index.ts',
  'web/src/api.ts',
  'web/src/api/index.ts',
  'web/src/services/api.ts',
  'web/src/components/MatchingResults.tsx',
  'web/src/components/ImageUploader.tsx',
  'web/src/components/ImageUpload.tsx',
  'web/src/pages/HomePage.tsx',
  'web/src/pages/MatchPage.tsx',
  'web/src/pages/ResultsPage.tsx',
  'web/src/pages/AboutPage.tsx',
]);

const FASHION_DUPLICATE_UNDER_TYPES_RE = /^web\/src\/types\/.+/i;

export const USER_WORKSPACE_FORBIDDEN_RULE = `
USER WORKSPACE — interzis absolut (module interne Cavallo, NU în proiecte utilizator):
- src/zero-latency/ (orice subpath)
- cavallo_task_generator/
- zero-latency-composer/ sau package name "zero-latency-composer"
- Fișiere placeholder: src/file1.txt, src/main_7.sh, .env_6 — folosește doar path-uri reale din plan
- Root package.json: workspaces doar ["web"]; mobile/ are npm install separat (fără workspace root)
`.trim();

export const FASHION_TYPESCRIPT_RULE = `
TypeScript fashion-fullstack (web/):
- Canonical: web/src/types.ts + web/src/api/matching.ts + web/src/components/MatchResults.tsx + ImageUploadPanel.tsx
- web/src/types.ts TREBUIE să exporte: ImageUpload, MatchResult, UploadResponse, Product, Outfit, OutfitMatch, MatchingRequest, ApiError
- Importuri relative: din web/src/*.ts(x) folosește from './types'; din web/src/components/ folosește from '../types' sau from '../api/matching'
- MatchResult = MatchItem (item_id, label, score) — NU id/matchedItem/success wrapper
- După compose: npm run typecheck trebuie să treacă — fixează TS2307/TS2339 re-emițând fișiere complete
`.trim();

export const FASHION_DUPLICATE_RULE = `
Fashion-fullstack — NU duplica tipuri/API/componente seed (folosește modulele existente):
- NU web/src/types/index.ts — doar web/src/types.ts
- NU web/src/api.ts sau web/src/api/index.ts — doar web/src/api/matching.ts
- NU MatchingResults.tsx — folosește MatchResults.tsx
- NU ImageUploader.tsx / ImageUpload.tsx — folosește ImageUploadPanel.tsx
- NU HomePage/MatchPage/ResultsPage/AboutPage — folosește Home/Match/Results/About.tsx
- Poți adăuga foldere noi (hooks/, pages/, utils/) — nu re-crea duplicatele de mai sus
`.trim();

/** Files allowed in fashion-fullstack web seed; compose orphans are pruned before gate. */
export const FASHION_WEB_CANONICAL_FILES = new Set([
  'web/src/main.tsx',
  'web/src/App.tsx',
  'web/src/types.ts',
  'web/src/vite-env.d.ts',
  'web/src/api/matching.ts',
  'web/src/components/ImageUploadPanel.tsx',
  'web/src/components/MatchResults.tsx',
]);

export function isJunkScaffoldPath(filePath: string): boolean {
  const normalized = normalizeWorkspacePath(filePath);
  return JUNK_SCAFFOLD_PATH_RE.test(normalized);
}

export function isFashionDuplicateScaffoldPath(filePath: string): boolean {
  const normalized = normalizeWorkspacePath(filePath);
  if (FASHION_DUPLICATE_EXACT.has(normalized)) return true;
  return FASHION_DUPLICATE_UNDER_TYPES_RE.test(normalized);
}
