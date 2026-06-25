# Context Warm Cache, Parallel Loading, Zero Latency Composer

## Architecture

```mermaid
flowchart TB
  Pipeline[AI Pipeline] --> Warm[WarmCacheManager]
  Composer[AI Composer UI] --> ZL[ZeroLatencyComposer]
  ZL --> Warm
  ZL --> ModelPreload[Model Preload]
  ZL --> Preplan[ZLPreplanner]
  Warm --> Parallel[ParallelContextLoader]
  Parallel --> Scheduler[ParallelScheduler]
  Scheduler --> W1[Worker 1]
  Scheduler --> W2[Worker 2]
  Scheduler --> WN[Workers 4-8]
  W1 --> RAM[WarmCacheStore RAM]
  W2 --> RAM
  WN --> RAM
  RAM --> Composer
```

## Parallel Context Loading

Files:

```text
ai/context/parallel/
  parallel-loader.ts
  parallel-scheduler.ts
  parallel-worker.ts
  parallel-priority.ts
  parallel-batching.ts
  parallel-types.ts
```

The loader splits large files into batches, schedules work with `HIGH | MEDIUM | LOW` priority, and sends work to a worker thread pool. The worker extracts:

- indexed documents
- deterministic embeddings
- symbols
- dependency edges
- semantic summaries

Example:

```ts
import { parallelContextLoader } from "../ai/context/parallel";

const result = await parallelContextLoader.loadWorkspace({
  workspaceRoot,
  activeFile,
  priority: "HIGH",
});
```

## Context Engine Warm Cache

Files:

```text
ai/context/warm-cache/
  warm-cache-manager.ts
  warm-cache-loader.ts
  warm-cache-predictor.ts
  warm-cache-store.ts
  warm-cache-types.ts
```

Warm Cache keeps context in RAM and updates only changed files by comparing content hashes. It integrates with:

- Context Engine restore/index
- Parallel Context Loader
- Model Router predictive warm
- AI Pipeline events

Example:

```ts
import { warmCacheManager } from "../ai/context/warm-cache";

warmCacheManager.warmAtStartup(workspaceRoot);
warmCacheManager.onProjectChange(workspaceRoot);
warmCacheManager.onFileOpen(filePath, content);
warmCacheManager.onFileChange(filePath, nextContent);
```

## Zero Latency Composer

Files:

```text
ai/composer/zero-latency/
  zl-composer.ts
  zl-preplanner.ts
  zl-context-preloader.ts
  zl-model-preloader.ts
  zl-cache.ts
  zl-scheduler.ts
  zl-types.ts
```

Zero Latency Composer schedules warm cache, context preload, model preload, and partial planning while the user is typing. The partial plan is local and cheap; the final Composer can replace it with model output.

Example:

```ts
import { zeroLatencyComposer } from "../ai/composer/zero-latency";

const tokenId = zeroLatencyComposer.prepare({
  workspaceRoot,
  objectiveDraft: "Add auth middleware",
  activeFile,
  openFiles,
  language: "ts",
  projectType: "backend",
});

const cached = zeroLatencyComposer.getCached(workspaceRoot, "Add auth middleware");
zeroLatencyComposer.cancel(tokenId);
```

## Sequence

```mermaid
sequenceDiagram
  participant U as User
  participant ZL as ZeroLatencyComposer
  participant WC as WarmCacheManager
  participant PL as ParallelContextLoader
  participant WK as Worker Pool
  participant MR as ModelRouter

  U->>ZL: focus/type in Composer
  ZL->>WC: ensureWarm(active files)
  WC->>PL: load files in parallel
  PL->>WK: file/embed/symbol/dependency tasks
  ZL->>MR: predict planning/coding models
  MR-->>ZL: selected models
  ZL->>ZL: create partial plan
  WK-->>WC: warmed context
  WC-->>ZL: RAM cache ready
```
