# CI-EXPO-TSCONFIG-BASE-001 — GitHub Actions typecheck: missing `expo/tsconfig.base`

| Câmp | Valoare |
|------|---------|
| ID | CI-EXPO-TSCONFIG-BASE-001 |
| Severitate | Medie (gate CI cloud) |
| Status | **În remediere** — GitHub [#4](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/issues/4). Remediat după typecheck verde pe Actions `main`. |
| Owner | Platform / CI |
| Sprint | Separat de SEC-C2 / PR2 |
| Depinde de | Nimic din CAD/provider profiles |

## Cauză (Faza 1, checkout curat)

1. `tsconfig.json` (rădăcina `caval-studio`) are `"extends": "expo/tsconfig.base"`.
2. `expo` lipsea din `dependencies` și `devDependencies`. Nu există npm workspaces. CI rulează `npm ci` fără `--omit=dev` / production-only.
3. `expo` apărea doar ca peer **opțional** al `@react-three/fiber` (`>=43`, `peerDependenciesMeta.optional`). `npm ci` nu îl instalează.
4. Local, `tsc` putea trece pentru că Node/TS urcau la `C:\Users\octav\node_modules\expo` (SDK 55.0.6, în afara repo-ului). Pe `ubuntu-latest` acel parent nu există → `TS6053`.

Nu s-a adăugat un `tsconfig.base.json` local. Nu s-a scos proiectul din gate-ul CI.

`fashion-matching-app/` este un nested Expo scaffold (manifest `expo ~52`); nu a fost șters. Decizie de menținere vs eliminare: **separată**, nu în acest ticket.

## Remediere

După ce typecheck a trecut pe Actions, 3 teste din `tests/main` (nu security) eșuau pe Linux pentru că hardcodau `C:\...`. Ajustate cu `path.resolve` / `path.join`. Nu s-au atins C2, CAD, profiles sau quality gates.

**De ce SDK 55:** același major ca install-ul accidental local care deja typecheck-uia; React 19.2.x (repo: `react@^19.2.7`); Node 20 pe GitHub Actions (SDK 57 cere Node 22). TypeScript 6 acceptă `module: "preserve"` din `expo/tsconfig.base`; `compilerOptions` locale (`module`/`moduleResolution` Node16, `jsx: react-jsx`) rămân peste preset.

## Criteriu de acceptare

- `npm ci` + `npm run typecheck` exit 0 pe Actions.
- `node -p "require.resolve('expo/tsconfig.base')"` rezolvă `node_modules/expo/tsconfig.base.json` **în repo**.
- Ticketul **Remediat** doar după un run verde pe `main`, nu după gate-uri locale.
