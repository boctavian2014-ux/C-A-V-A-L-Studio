// ──────────────────────────────────────────────
//  Agent modes — Kilo Code style
// ──────────────────────────────────────────────

import type { RoutingIntent } from "../types";
import type { ModelSelectionId } from "../models/model-catalog";

export type AgentModeId = "ask" | "code" | "agentic" | "architect" | "debug";

export interface AgentMode {
  id: AgentModeId;
  label: string;
  shortLabel: string;
  intent: RoutingIntent;
  defaultModel: ModelSelectionId;
  description: string;
}

export const AGENT_MODES: AgentMode[] = [
  {
    id: "agentic",
    label: "Agentic",
    shortLabel: "Agentic",
    intent: "kilocode",
    defaultModel: "caval-auto/balanced",
    description: "Pipeline complet — de la idee la proiect livrat",
  },
  {
    id: "ask",
    label: "Ask",
    shortLabel: "Ask",
    intent: "fallback",
    defaultModel: "caval-auto/balanced",
    description: "Întrebări rapide, explicații, fără modificări de cod",
  },
  {
    id: "code",
    label: "Code",
    shortLabel: "Code",
    intent: "kilocode",
    defaultModel: "caval-auto/balanced",
    description: "Scrie cod cu modelul ales — direct, fără pipeline multi-agent",
  },
  {
    id: "architect",
    label: "Architect",
    shortLabel: "Arch",
    intent: "planning",
    defaultModel: "caval-auto/frontier",
    description: "Planifică features complexe înainte de implementare",
  },
  {
    id: "debug",
    label: "Debug",
    shortLabel: "Debug",
    intent: "debug",
    defaultModel: "caval-auto/balanced",
    description: "Analizează erori și sugerează fix-uri",
  },
];

export function getAgentMode(id: AgentModeId): AgentMode {
  return AGENT_MODES.find((m) => m.id === id) ?? AGENT_MODES.find((m) => m.id === "code")!;
}

/** Multi-agent pipeline + full delivery — only in Agentic mode. */
export function isAgenticPipelineMode(mode: string | undefined): boolean {
  return mode === "agentic";
}

export interface CavalConfig {
  models?: {
    default?: ModelSelectionId;
    perMode?: Partial<Record<AgentModeId, ModelSelectionId>>;
  };
  mcp?: {
    servers?: Array<{
      id: string;
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
      enabled?: boolean;
    }>;
  };
  autocomplete?: {
    model?: string;
    enabled?: boolean;
  };
}

export const DEFAULT_CAVAL_CONFIG: CavalConfig = {
  models: {
    default: "caval-auto/balanced",
    perMode: {
      ask: "caval-auto/balanced",
      code: "caval-auto/balanced",
      agentic: "caval-auto/balanced",
      architect: "caval-auto/frontier",
      debug: "caval-auto/balanced",
    },
  },
  autocomplete: {
    model: "north-mini-code",
    enabled: true,
  },
  mcp: { servers: [] },
};
