# CI-EXPO-TSCONFIG-BASE-001 — GitHub Actions typecheck: missing `expo/tsconfig.base`

| Câmp | Valoare |
|------|---------|
| ID | CI-EXPO-TSCONFIG-BASE-001 |
| Severitate | Medie (gate CI cloud) |
| Status | **Deschis** |
| Owner | Platform / CI |
| Sprint | Separat de SEC-C2; blochează „cloud CI verde”, nu PR2 desktop |
| Depinde de | Nimic din CAD/provider profiles |

## Problemă

Job-ul `test` din `.github/workflows/test.yml` eșuează la `npm run typecheck`:

```text
tsconfig.json(59,14): error TS6053: File 'expo/tsconfig.base' not found.
```

Exemplu: [run 31636777124](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/actions/runs/31636777124) (PR #3) și aceleași ~45s fail-uri pe `main` dinainte de PR1.

Rădăcina: `tsconfig.json` are `"extends": "expo/tsconfig.base"`, dar `expo` **nu** este dependență în `package.json`. Pe CI, `npm ci` este curat → pachetul lipsește. Local, typecheck poate trece dacă `expo` există accidental în `node_modules` (peer opțional din `@react-three/fiber`, install vechi, etc.). Gate-urile locale **nu** înlocuiesc gate-ul cloud.

## Ce nu este

- Nu este o regresie introdusă de SEC-C2 / PR #3.
- Nu se amestecă cu PR2 desktop (`attachMainCadSecrets` / provider profiles).
- Nu se „rezolvă” prin skip typecheck în workflow.

## Remediere propusă

1. Scoate `"extends": "expo/tsconfig.base"` din `tsconfig.json` rădăcină (aplicația desktop nu are nevoie de compiler defaults Expo), **sau** mută extends-ul doar într-un tsconfig mobile dacă un pachet Expo este adăugat explicit.
2. Nu adăuga `expo` ca dependență doar ca să tacă CI, decât dacă mobile-ul îl cere cu adevărat.
3. Confirmă `npm ci` + `npm run typecheck` într-un checkout curat (sau în Actions) înainte de a marca ticketul **Remediat**.

## Criteriu de acceptare

- Job-ul GitHub Actions `test` trece de Typecheck pe `ubuntu-latest` după `npm ci`.
- Typecheck/lint/test/build locale rămân verzi.
- Ticketul rămâne deschis până run-ul cloud este verde; nu se închide pe baza gate-urilor locale.
