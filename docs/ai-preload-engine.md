# AI Intelligent Preload Engine

Modulul **AI Intelligent Preload Engine** încarcă modelele AI înainte ca utilizatorul să le ceară explicit, reducând latența percepută în pipeline-ul Caval Studio (Suggestions → Composer → Review).

## Structură

```
ai/preload/
├── preload-manager.ts    # Orchestrator principal (main process)
├── preload-strategy.ts   # 7 strategii de preload
├── preload-predictor.ts  # Predicție modele + pipeline
├── preload-cache.ts      # Cache inteligent + istoric adaptiv
├── preload-events.ts     # Event bus dedicat
├── preload-worker.ts     # Worker thread (scoring + scheduling)
└── index.ts              # Export public
```

Integrare IPC: `src/main/preload-handlers.ts`  
Worker compilat: `dist/main/preload-worker.js`

## Arhitectură

```mermaid
flowchart TB
  subgraph Renderer
    UI[Workbench / Composer / Chat]
    Bridge[window.caval.preload]
  end

  subgraph MainProcess
    PM[PreloadManager]
    Worker[preload-worker.ts]
    Cache[PreloadCache]
    Predictor[PreloadPredictor]
    Strategies[7 Strategies]
    Router[ModelRouter]
    Ctx[ContextEngineApi]
    Bus[pipelineEventBus]
  end

  subgraph External
    Ollama[Ollama /api/generate]
    Cloud[Cloud Providers HEAD warm]
  end

  UI --> Bridge
  Bridge -->|IPC| PM
  Bus --> PM
  PM --> Predictor
  PM --> Strategies
  PM --> Cache
  PM --> Worker
  Worker -->|scored tasks| PM
  PM --> Router
  PM --> Ctx
  PM --> Ollama
  PM --> Cloud
  PM -->|preload events| Bridge
```

## Flux pipeline AI

```mermaid
sequenceDiagram
  participant U as User
  participant C as Composer
  participant B as pipelineEventBus
  participant P as PreloadManager
  participant W as Worker
  participant O as Ollama

  U->>C: Run objective (plan mode)
  C->>B: pipeline.start
  B->>P: onPipelineEvent
  P->>P: mergeTargets (7 strategies)
  P->>W: score-tasks
  W-->>P: prioritized tasks
  P->>O: warm fast models (foreground)
  P->>O: warm slow models (background)
  C->>B: node.enter suggestions
  B->>P: preload composer stage
  Note over P,O: Model already in RAM
  U->>C: Approve suggestions
  C->>B: node.enter composer
  P->>P: preload review stage
```

## Strategii

| Strategie | Rol |
|-----------|-----|
| **predictive** | Anticipă modele din istoric + heuristici |
| **contextual** | Fișiere deschise, tab activ, workspace |
| **orchestrated** | Suggestions → Composer → Review |
| **parallel** | Modele rapide foreground, lente background |
| **lazy** | Doar dacă cache miss |
| **warm-cache** | Reîncălzire modele cu hit-uri recente |
| **adaptive** | Ajustare greutăți din hit/miss ratio |

## Reguli de operare

- **Non-blocking UI** — toate warm-urile sunt async, cu AbortController
- **Worker threads** — scoring și scheduling în preload-worker.ts
- **Cache inteligent** — max 6 modele, LRU + priority, persist `.caval/preload-cache.json`
- **Eviction** — modele nefolosite > 2 min, keep_alive: 0 pentru Ollama
- **Prioritate** — ultra_fast / fast în foreground (max 2 concurrent)
- **Background** — modele slow (ex. llama3.1:70b) max 2 concurrent

## Integrări

| Componentă | Hook |
|------------|------|
| AI Pipeline | pipelineEventBus.on() în PreloadManager |
| AI Composer | caval:composer-run → onUserAction |
| AI Suggestions | pipeline node.enter suggestions |
| AI Review | pipeline node.enter review |
| Context Engine | onWorkspaceOpen → indexWorkspace |
| Model Router | rankForIntent(), warm cloud via HEAD |
| Chat stream | model-handlers.ts → recordUsage + notify |

## API Renderer

```typescript
const status = await window.caval.preload.status();
await window.caval.preload.warm("qwen2.5-coder:7b", "chat");
await window.caval.preload.notify({
  action: "files.changed",
  openFiles: ["src/app.tsx"],
  activeFile: "src/app.tsx",
});
window.caval.preload.subscribe();
const off = window.caval.preload.onEvent((e) => console.log(e.type, e.modelId));
```

## Teste

```bash
npm test -- tests/preload/preload-engine.test.ts
```
