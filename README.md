# CAVALO Studio

IDE românesc premium cu AI frontier, Context Engine, Coding Arena multi-agent și straturi pentru billing, CAD și marketplace.

## Cerințe

- Node.js ≥ 20
- npm
- Windows / macOS / Linux (Electron)

## Pornire rapidă

```bash
npm install
npm run dev      # webpack watch (terminal 1)
npm start        # Electron (terminal 2)
```

Teste: `npm test`

Config proiect: [`caval.jsonc`](caval.jsonc) (modele, multi-agent, zero-latency, MCP).

---

## Structura proiectului

```
caval-studio/
├── README.md                 # Acest fișier — overview + structură
├── caval.jsonc               # Config IDE (modele, arena, MCP, billing flags)
├── package.json
├── tsconfig.json
├── webpack.config.js         # main (Electron) + renderer + node-services
├── vitest.config.ts
│
├── src/                      # Shell Electron + UI workbench
│   ├── main/                 # Proces principal
│   │   ├── electron-main.ts  # Entry Electron
│   │   ├── preload.ts        # Bridge window.caval (IPC)
│   │   ├── model-handlers.ts # Chat stream, AI complete
│   │   ├── zl-handlers.ts    # Zero-latency composer IPC
│   │   ├── git-handlers.ts
│   │   ├── terminal-handlers.ts
│   │   └── mcp-handlers.ts
│   ├── renderer/             # React workbench
│   │   ├── workbench-app.tsx
│   │   ├── WorkbenchRoot.tsx
│   │   ├── components/       # Editor, Git, Terminal, Settings, Engineering…
│   │   └── store/            # Zustand (editor, git, settings…)
│   ├── shared/               # Utilitare partajate (ex. diff-utils)
│   └── caval-runtime.ts      # Entry node-services
│
├── ai/                       # AI Layer
│   ├── composer/             # Chat UI + pipeline
│   │   ├── AIPanel.tsx       # Panou chat principal
│   │   ├── ai-store.ts       # State mesaje, streaming, scaffold apply
│   │   ├── multi-agent/      # Coding Arena pipeline (memory→compose)
│   │   ├── zero-latency/     # Prewarm context/model la typing
│   │   ├── scaffold-parser.ts
│   │   └── scaffold-apply.ts
│   ├── context-engine/       # Context builder pentru prompturi
│   ├── context/              # Warm cache, parallel loader
│   ├── models/               # Catalog, auto-router, preload
│   ├── prompts/              # System prompts (arena, dev assistant…)
│   ├── pipeline/             # model-completion, fast-pipeline, tool loop
│   ├── providers/            # OpenRouter, Ollama, etc.
│   └── mcp/                  # Client MCP
│
├── context-engine/           # Indexare proiect, embeddings, search
├── components/               # LogicFlow, UI shared
├── themes/                   # Pulse Tech theme provider
├── styles/                   # CSS global
├── assets/                   # Iconițe, splash, cal neon
│
├── billing/                  # Stripe, Supabase, server billing
├── admin/                    # Admin billing UI
├── marketplace/              # Marketplace extensii
├── engineering/              # CAD server, OpenSCAD runner
├── mobile/                   # Expo/EAS build helpers
├── mobile-app/
├── romania/                  # Romania Layer (ANAF, eFactura…)
├── ui-kit/
│
├── tests/                    # Vitest (ai/, main/, billing/, …)
├── docs/                     # Arhitectură, AI layer, zero-latency…
├── scripts/                  # Build, audit, icons
├── installer/                # electron-builder, icons OS
├── supabase/                 # Migrații SQL
└── dist/                     # Output webpack (generat)
```

---

## Straturi principale

| Strat | Rol | Locație |
|-------|-----|---------|
| **Workbench** | Editor Monaco, file tree, terminal, Git | `src/renderer/` |
| **Main / IPC** | FS, AI stream, preload, MCP spawn | `src/main/` |
| **AI Composer** | Chat, Code Arena, scaffold → fișiere | `ai/composer/` |
| **Context Engine** | Fișiere relevante, warm cache | `context-engine/`, `ai/context/` |
| **Model Router** | Auto Frontier/Balanced, fallback | `ai/models/`, `ai/model-router.ts` |
| **Cloud** | Billing, CAD API, marketplace | `billing/`, `engineering/` |

---

## Moduri chat (AI)

| Mod | Scop |
|-----|------|
| **Ask** | Întrebări, explicații |
| **Code** | Scrie fișiere — pipeline Arena + ` ```lang:path``` ` |
| **Architect** | Planificare înainte de implementare |
| **Debug** | Analiză erori |

În **Code Mode**: toggle **Review strict** = Merge + Supervisor LLM (mai lent, mai sigur).

---

## Flux Code Arena (simplificat)

```
Typing → Zero-Latency prepare (context + model warm)
Enter  → Memory → Context → Decompose → Sub-agents → Merge → Supervisor → Compose
Compose → parseScaffoldFiles → applyScaffoldToWorkspace → editor
```

Fragmentele de cod fără path valid (snippet-uri din chat) sunt respinse de `isScaffoldFragment()`.

---

## Documentație suplimentară

- [`docs/architecture.md`](docs/architecture.md) — cele 6 straturi
- [`docs/ai-layer.md`](docs/ai-layer.md) — routing modele
- [`docs/context-zero-latency.md`](docs/context-zero-latency.md) — prewarm la typing
- [`docs/ai-composer.md`](docs/ai-composer.md) — pipeline composer clasic

---

## Licență

Proiect privat (`private: true`).
