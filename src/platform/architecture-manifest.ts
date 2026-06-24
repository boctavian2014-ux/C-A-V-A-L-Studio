export type CavalLayer =
  | "core-editor"
  | "ai"
  | "context-engine"
  | "extensions"
  | "cloud-services"
  | "romania";

export interface ArchitectureLayer {
  id: CavalLayer;
  name: string;
  responsibility: string;
  entrypoints: string[];
}

export const createArchitectureManifest = (): ArchitectureLayer[] => [
  {
    id: "core-editor",
    name: "Core Editor Layer",
    responsibility: "VS Code fork foundations: workbench, editor services, extension host, settings and keybindings.",
    entrypoints: ["src/core/editor-layer.ts", "src/main/electron-main.ts"]
  },
  {
    id: "ai",
    name: "AI Layer",
    responsibility: "Chat, composer, agents, model routing and frontier provider orchestration.",
    entrypoints: ["ai/model-router.ts", "ai/composer/plan/plan-generator.ts"]
  },
  {
    id: "context-engine",
    name: "Context Engine",
    responsibility: "Project indexing, embeddings, local cache, vector DB, semantic search and dependency graph.",
    entrypoints: ["context-engine/indexer.ts", "context-engine/semantic-search.ts"]
  },
  {
    id: "extensions",
    name: "Extensions Layer",
    responsibility: "First-party marketplace plus compatibility bridge for VS Code extensions.",
    entrypoints: ["src/extensions/extension-host.ts", "marketplace/server/index.ts"]
  },
  {
    id: "cloud-services",
    name: "Cloud Services Layer",
    responsibility: "Accounts, sync, telemetry and managed AI/context services.",
    entrypoints: ["src/cloud-services/accounts.ts", "src/cloud-services/sync.ts"]
  },
  {
    id: "romania",
    name: "Romania Layer",
    responsibility: "Romanian localization, fiscal APIs, eFactura, ONRC workflows and education mode.",
    entrypoints: ["romania/localization/ro.json", "romania/anaf-api.ts"]
  }
];
