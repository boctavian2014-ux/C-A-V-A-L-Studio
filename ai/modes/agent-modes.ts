// ──────────────────────────────────────────────
//  Agent modes — Kilo Code style
// ──────────────────────────────────────────────

import type { RoutingIntent } from "../types";
import type { ModelSelectionId } from "../models/model-catalog";

export type AgentModeId = "ask" | "code" | "architect" | "debug";

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
    id: "ask",
    label: "Ask",
    shortLabel: "Ask",
    intent: "fallback",
    defaultModel: "caval-auto/free",
    description: "Întrebări rapide, explicații, fără modificări de cod",
  },
  {
    id: "code",
    label: "Code",
    shortLabel: "Code",
    intent: "kilocode",
    defaultModel: "caval-auto/balanced",
    description: "Scrie, refactorizează și aplică modificări de cod",
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
  return AGENT_MODES.find((m) => m.id === id) ?? AGENT_MODES[0];
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
    default: "caval-auto/free",
    perMode: {
      ask: "caval-auto/free",
      code: "caval-auto/balanced",
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
