# Cavallo Workbench — Menu Commands

Comenzile native Electron (`caval:menu-command`) sunt rutate prin `src/renderer/commands/menu-command-router.ts`.

| Comandă | Status | Acțiune |
|---------|--------|---------|
| `new-file` | implementat | Tab untitled nou |
| `save` | implementat | Salvează tab activ |
| `save-as` | implementat | Dialog Save As |
| `open-settings` | implementat | Panou Settings |
| `find` | implementat | Monaco Find |
| `replace` | implementat | Monaco Replace |
| `find-in-files` | implementat | Panou Search |
| `replace-in-files` | implementat | Panou Search |
| `toggle-line-comment` | implementat | Monaco |
| `toggle-block-comment` | implementat | Monaco |
| `emmet-expand` | în curând | Toast |
| `selection-expand` / `selection-shrink` | implementat | Monaco |
| `copy-line-up/down`, `move-line-up/down` | implementat | Monaco |
| `cursor-above/below` | implementat | Monaco |
| `palette` | implementat | Command Palette |
| `open-view` | implementat | Command Palette |
| `split-editor`, `single-editor` | în curând | Toast |
| `toggle-sidebar` | implementat | Toggle sidebar |
| `view-explorer` | implementat | Activity Explorer |
| `view-search` | implementat | Activity Search |
| `view-source-control` | implementat | Activity Git |
| `view-run` | implementat | Tab Debug (panel jos) |
| `view-extensions` | implementat | Activity Extensions |
| `view-problems` | implementat | Tab Probleme |
| `view-output` | implementat | Tab Output |
| `view-debug-console` | implementat | Tab Debug |
| `word-wrap` | implementat | Toggle word wrap |
| `go-back` / `go-forward` | implementat | Istoric navigare fișiere |
| `go-to-file` | implementat | Quick Open (Ctrl+P) |
| `go-to-symbol-editor` | implementat | Monaco Quick Outline |
| `go-to-definition` / `go-to-references` | implementat | Search IPC + Monaco |
| `go-to-line` / `go-to-bracket` | implementat | Monaco |
| `next-problem` / `previous-problem` | implementat | Problems store |
| `run-debug` / `run-without-debug` / `stop-debug` | implementat | Debug IPC |
| `terminal-new` / `terminal-split` | implementat | Sesiune terminal nouă |
| `task-build` | implementat | `npm run build` + Output |
| `about` / `license` | implementat | Settings → About |
| Restul comenzilor Go/Run/Help | în curând | Toast discret + `console.warn` |

## Command Palette

Comenzi suplimentare în `command-registry.ts`: Explorer, Terminal New/Toggle, Output, Problems, verify/build.

## Evenimente terminal

- `caval:terminal-new` — sesiune PTY nouă (cwd = folder proiect)
- `caval:terminal-split` — aceeași acțiune ca `terminal-new` (split vizual în faza 2)
- `caval:terminal-toggle` — arată/ascunde panelul
- `caval:terminal-panel-tab` — `{ tab: 'output' \| 'problems' \| 'debug' \| 'terminal' }`
