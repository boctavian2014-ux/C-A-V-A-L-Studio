# Cavallo IDE — QA Checklist

Parcurgere manuală după modificări majore UI/workbench.

## 1. Activity bar (6 butoane)

- [ ] Explorer — deschide arbore fișiere
- [ ] Search — panou căutare
- [ ] Git — status repo
- [ ] Extensions — marketplace + MCP
- [ ] Settings — secțiuni setări
- [ ] Account — deschide Safety în settings

## 2. Titlebar / WorkbenchHeader

- [ ] Logo + path activ
- [ ] Toggle sidebar
- [ ] Terminal toolbar — click = terminal nou; click dreapta = toggle panel
- [ ] Robotics AI toggle

## 3. Tab bar

- [ ] Deschide fișier din explorer
- [ ] Schimbă tab activ
- [ ] Închide tab (×)
- [ ] Indicator dirty (punct portocaliu)

## 4. Terminal panel

- [ ] Tab TERMINAL — PTY funcțional, input/output
- [ ] Buton **+** — sesiune nouă în folder proiect
- [ ] Tab-uri sesiune cu închidere (×)
- [ ] Tab OUTPUT — loguri CAVAL după verify/build
- [ ] Tab PROBLEME — erori parsate; click → reveal în editor
- [ ] Tab DEBUG — DebugPanel
- [ ] Resize drag + minimize (⌄)
- [ ] Meniu Terminal → New / Split
- [ ] View → Output / Problems

## 5. Meniu nativ

### File
- [ ] New Text File (Ctrl+N)
- [ ] Save / Save As
- [ ] Preferences

### Edit
- [ ] Find / Replace (Monaco)
- [ ] Toggle comment
- [ ] Move/copy line

### View
- [ ] Command Palette
- [ ] Explorer / Search / Git / Extensions
- [ ] Problems / Output / Debug Console
- [ ] Word Wrap

### Go
- [ ] Go to File (Ctrl+P) — din meniu și shortcut
- [ ] Go to Symbol in Editor
- [ ] Next/Previous Problem (cu probleme active)

### Run / Terminal
- [ ] Start Debugging (dacă config există)
- [ ] New Terminal
- [ ] Run Build Task

### Help
- [ ] About → Settings About + toast

## 6. Command palette (Ctrl+Shift+P)

- [ ] View: Explorer
- [ ] Terminal: New / Toggle
- [ ] View: Output / Problems
- [ ] Run verify / build

## 7. AI panel

- [ ] Send / Stop
- [ ] Buton Composer (multi-file) vizibil — deschide mod Build
- [ ] Verify workspace → populează Output/Problems
- [ ] Build → Output

## 8. Git panel

- [ ] Stage / commit / pull / push (dacă repo)

## 9. Extensions / Marketplace

- [ ] Cu `npm run marketplace:serve` — listă extensii
- [ ] Install — scrie în `.cavalo/extensions/` (nu doar markInstalled)
- [ ] Mesaj clar când serverul nu rulează

## 10. Status bar

- [ ] Branch git
- [ ] Număr erori/avertismente real din Problems
- [ ] Click pe erori → tab Problems
- [ ] Toggle AI

## Regresie automată

```bash
npm test -- tests/renderer/menu-command-router.test.ts tests/renderer/terminal-sessions.test.ts tests/renderer/output-store.test.ts tests/main/terminal-ipc.integration.test.ts
```
