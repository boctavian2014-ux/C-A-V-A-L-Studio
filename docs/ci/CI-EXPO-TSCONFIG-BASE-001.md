# CI-EXPO-TSCONFIG-BASE-001 — GitHub Actions typecheck: missing `expo/tsconfig.base`

| Câmp | Valoare |
|------|---------|
| ID | CI-EXPO-TSCONFIG-BASE-001 |
| Severitate | Medie (gate CI cloud) |
| Status | **Remediat** — GitHub [#4](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/issues/4). PR [#5](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/pull/5); `main` Actions run [31673190728](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/actions/runs/31673190728) (test + smoke-electron verde). |
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

După ce typecheck a trecut pe Actions, 3 teste din `tests/main` hardcodau `C:\...`. Fixtures folosesc `path.join` / `path.resolve` pentru filesystem local, `path.posix` pentru segmente relative serializate, și `path.win32` pentru input Windows — fără `if (platform !== win32) return`.

ProvidePlugin `global: "globalThis"` este **compatibilitate de bundling** (Linux webpack + `three-stdlib/chevrotain`), nu workaround de test. Alias-ul trebuie să rezolve `src/renderer/provide-global.js`; renderer-ul nu depinde de un pachet npm `globalThis`. Păstrat de `tests/ci/webpack-globalthis-alias.test.ts` și de jobul `build` pe Actions.

**De ce SDK 55:** același major ca install-ul accidental local care deja typecheck-uia; React 19.2.x (repo: `react@^19.2.7`); Node 20 pe GitHub Actions (SDK 57 cere Node 22). TypeScript 6 acceptă `module: "preserve"` din `expo/tsconfig.base`; `compilerOptions` locale (`module`/`moduleResolution` Node16, `jsx: react-jsx`) rămân peste preset.

## Criteriu de acceptare

Îndeplinit pe `main` (2026-08-13): typecheck, test (fără `continue-on-error`), smoke Electron, suite locală 1028 passed / 2 skipped / 226 fișiere. Ticket **închis**.
