/**
 * Curated 2026 software trends corpus — offline "web context" for Caval AI.
 * No network; deterministic guidance per product category.
 */

export type SoftwareCategory =
  | "web"
  | "mobile"
  | "desktop"
  | "cli"
  | "api"
  | "game"
  | "ai-ml"
  | "blockchain"
  | "iot"
  | "database";

export interface CategoryTrendPack {
  category: SoftwareCategory;
  label: string;
  /** What to emphasize when "searching" context for this category. */
  searchFocus: string[];
  /** Design / architecture / stack trends (2026). */
  trends: string[];
  /** Suggested stack defaults when the user did not specify. */
  defaultStacks: string[];
  /** Patterns the model should prefer in generated code. */
  codePatterns: string[];
}

export const SOFTWARE_TRENDS_2026: Record<SoftwareCategory, CategoryTrendPack> = {
  web: {
    category: "web",
    label: "Web (landing / app / dashboard / ecommerce / blog)",
    searchFocus: [
      "UI/UX patterns 2026",
      "design systems and component libraries",
      "performance and Core Web Vitals",
      "accessible responsive layouts",
    ],
    trends: [
      "Server components + selective client islands; avoid shipping unused JS.",
      "Design tokens + CSS variables; dark/light from day one.",
      "Motion used for hierarchy (2–3 intentional animations), not decoration.",
      "Ecommerce: PDP speed, trust signals, checkout as one composition.",
      "Dashboards: dense data with clear primary action, not card soup.",
      "Prefer typed fullstack (TypeScript) with clear API boundaries.",
    ],
    defaultStacks: [
      "React/Next or Vite + React",
      "Tailwind or design-token CSS",
      "Node/Express or Next route handlers for API",
    ],
    codePatterns: [
      "Feature folders; shared UI kit; no hardcoded secrets.",
      "Semantic HTML; keyboard focus; aria where interactive.",
      "Loading / empty / error states for every data view.",
    ],
  },
  mobile: {
    category: "mobile",
    label: "Mobile (iOS / Android / RN / Flutter)",
    searchFocus: [
      "mobile UI patterns",
      "app store guidelines",
      "offline-first and push",
      "platform navigation patterns",
    ],
    trends: [
      "Thumb-zone primary actions; large tap targets (44×44).",
      "Native navigation stacks; avoid web-like multi-navbar chrome.",
      "Expo / React Native for cross-platform; SwiftUI/Compose for platform-first.",
      "Offline cache + optimistic UI; clear sync status.",
      "Privacy nutrition labels and permission just-in-time prompts.",
    ],
    defaultStacks: ["Expo (React Native)", "Flutter", "SwiftUI", "Jetpack Compose"],
    codePatterns: [
      "Safe-area insets; platform-specific shadows/typography sparingly.",
      "List virtualization for long feeds.",
      "Deep links and app state restoration.",
    ],
  },
  desktop: {
    category: "desktop",
    label: "Desktop (Electron / native / cross-platform)",
    searchFocus: [
      "desktop UI patterns",
      "OS integration",
      "windowing and menus",
      "native feel vs web shell",
    ],
    trends: [
      "Electron/Tauri with hardened IPC; never trust renderer for secrets.",
      "Native menus, keyboard accelerators, and system tray where useful.",
      "Fluent / HIG / GTK cues depending on target OS.",
      "Offline-capable local storage; auto-update with signed builds.",
    ],
    defaultStacks: ["Electron + React", "Tauri + React/Svelte", "Qt", ".NET MAUI"],
    codePatterns: [
      "Main/preload/renderer separation; contextIsolation.",
      "File dialogs and drag-drop via privileged APIs only.",
      "Remember window bounds per display.",
    ],
  },
  cli: {
    category: "cli",
    label: "CLI / terminal tools",
    searchFocus: [
      "CLI UX patterns",
      "arg parsing",
      "TTY color and progress",
      "exit codes and scripting",
    ],
    trends: [
      "Subcommands + consistent --help; POSIX-friendly flags.",
      "Progress on stderr; machine-readable --json on stdout.",
      "Non-zero exit codes for failure; quiet mode for CI.",
      "Prefer zero or few runtime deps for installable CLIs.",
    ],
    defaultStacks: ["Node (commander/yargs)", "Go cobra", "Rust clap", "Python typer/click"],
    codePatterns: [
      "Validate args early; print actionable errors.",
      "Config file + env + flags precedence documented.",
      "Idempotent commands safe to re-run.",
    ],
  },
  api: {
    category: "api",
    label: "API / backend / microservices",
    searchFocus: [
      "REST and OpenAPI",
      "GraphQL schema design",
      "authn/authz",
      "observability",
    ],
    trends: [
      "OpenAPI-first or schema-first GraphQL; versioned contracts.",
      "Idempotency keys for payments/writes; problem+json errors.",
      "JWT/session with clear audience; rate limits at edge.",
      "Health/ready probes; structured logs; traces across services.",
    ],
    defaultStacks: ["Express/Fastify", "NestJS", "Go chi/fiber", "ASP.NET Minimal APIs"],
    codePatterns: [
      "Layered routes → services → repos; DTOs validated.",
      "No secrets in responses; redact logs.",
      "Pagination cursors over huge offsets.",
    ],
  },
  game: {
    category: "game",
    label: "Games (2D / 3D / web / Unity / Godot)",
    searchFocus: [
      "game loops and scenes",
      "input and camera",
      "asset pipelines",
      "engine-specific patterns",
    ],
    trends: [
      "Fixed timestep simulation; render interpolated.",
      "Data-driven entities; avoid god-objects.",
      "Web: WebGL/WebGPU or lightweight canvas for 2D.",
      "Unity DOTS/Godot signals where scale needs it; keep prototypes simple.",
    ],
    defaultStacks: ["Phaser / Pixi", "Three.js", "Godot 4", "Unity"],
    codePatterns: [
      "Separate update/physics/render.",
      "Asset manifests; preload critical packs.",
      "Pause/menu as scene state machine.",
    ],
  },
  "ai-ml": {
    category: "ai-ml",
    label: "AI / ML / data science",
    searchFocus: [
      "model architecture",
      "data pipelines",
      "evaluation",
      "serving and cost",
    ],
    trends: [
      "Small specialized models + RAG over giant monoliths when data is local.",
      "Reproducible pipelines (seed, versioned datasets, experiment IDs).",
      "Eval harness before shipping; guardrails on user content.",
      "Batch vs online inference clearly separated.",
    ],
    defaultStacks: ["Python + PyTorch/sklearn", "TypeScript + local ONNX", "LangChain-style orchestration sparingly"],
    codePatterns: [
      "Config-driven hyperparameters; no magic numbers buried in notebooks-only.",
      "Typed feature schemas; fail on drift.",
      "Cache embeddings; cap context windows.",
    ],
  },
  blockchain: {
    category: "blockchain",
    label: "Blockchain / Web3 / smart contracts",
    searchFocus: [
      "smart contract patterns",
      "DeFi security",
      "NFT metadata",
      "wallet UX",
    ],
    trends: [
      "Auditable contracts; Checks-Effects-Interactions; reentrancy guards.",
      "Account abstraction / smarter wallet UX; clear gas feedback.",
      "Off-chain indexing (subgraph) for reads; on-chain for settlement.",
      "Never hardcode private keys; testnets first.",
    ],
    defaultStacks: ["Solidity + Hardhat/Foundry", "ethers/viem", "CosmWasm / Move where relevant"],
    codePatterns: [
      "Access control roles; events for every state change.",
      "Upgradeability only with explicit proxy docs.",
      "Fuzz and unit tests for invariants.",
    ],
  },
  iot: {
    category: "iot",
    label: "IoT / embedded",
    searchFocus: [
      "sensor integration",
      "MQTT/real-time",
      "power budgets",
      "OTA updates",
    ],
    trends: [
      "Edge preprocess; cloud for aggregation.",
      "MQTT/WebSocket with backoff; durable local queue.",
      "Secure boot / signed OTA where hardware allows.",
      "Arduino/ESP vs Pi: pick by power and OS needs.",
    ],
    defaultStacks: ["ESP-IDF / Arduino", "Raspberry Pi + Python/Node", "MQTT + Timescale/Influx"],
    codePatterns: [
      "Watchdogs; reconnect loops; telemetry heartbeats.",
      "Calibrated units in messages; schema version field.",
      "Simulate hardware in tests with fakes.",
    ],
  },
  database: {
    category: "database",
    label: "Database / schema / migrations",
    searchFocus: [
      "schema design",
      "indexing",
      "migrations",
      "query performance",
    ],
    trends: [
      "Normalize for write integrity; deliberate denorm for read paths.",
      "Migrations forward-only in prod; expand/contract for zero-downtime.",
      "Indexes for actual query predicates; EXPLAIN before guessing.",
      "RLS / tenant isolation when multi-tenant SaaS.",
    ],
    defaultStacks: ["PostgreSQL", "SQLite for local/edge", "Prisma/Drizzle/Knex migrations"],
    codePatterns: [
      "Idempotent migrations; never edit applied files.",
      "Soft-delete vs hard-delete policy explicit.",
      "Connection pooling; statement timeouts.",
    ],
  },
};

/** Flat searchable documents derived from the corpus. */
export function trendSearchDocuments(
  category: SoftwareCategory
): Array<{ id: string; text: string; weight: number }> {
  const pack = SOFTWARE_TRENDS_2026[category];
  const docs: Array<{ id: string; text: string; weight: number }> = [];
  pack.searchFocus.forEach((t, i) =>
    docs.push({ id: `${category}-focus-${i}`, text: t, weight: 0.8 })
  );
  pack.trends.forEach((t, i) =>
    docs.push({ id: `${category}-trend-${i}`, text: t, weight: 1 })
  );
  pack.codePatterns.forEach((t, i) =>
    docs.push({ id: `${category}-pattern-${i}`, text: t, weight: 0.9 })
  );
  pack.defaultStacks.forEach((t, i) =>
    docs.push({ id: `${category}-stack-${i}`, text: `Default stack: ${t}`, weight: 0.7 })
  );
  return docs;
}
