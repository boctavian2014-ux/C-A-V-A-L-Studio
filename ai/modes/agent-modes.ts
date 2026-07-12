// ──────────────────────────────────────────────
//  Agent modes — CAVALLO Enterprise + Agentic
// ──────────────────────────────────────────────

import type { RoutingIntent } from "../types";
import type { ModelSelectionId } from "../models/model-catalog";
import type { CavalloModesConfig } from "./mode-router";

export type AgentModeId = "ask" | "code" | "build" | "release" | "agentic" | "plan" | "debug";

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
    id: "plan",
    label: "Plan",
    shortLabel: "Plan",
    intent: "planning",
    defaultModel: "caval-auto/frontier",
    description: "Planificare enterprise — arhitectură, roadmap, KPIs (fără cod)",
  },
  {
    id: "code",
    label: "Code",
    shortLabel: "Code",
    intent: "kilocode",
    defaultModel: "caval-auto/balanced",
    description: "Implementare cod — direct, fără pipeline multi-agent",
  },
  {
    id: "build",
    label: "Build",
    shortLabel: "Build",
    intent: "kilocode",
    defaultModel: "caval-auto/balanced",
    description: "Autonomous Build Engine — scrie direct în workspace, fără cod în chat",
  },
  {
    id: "release",
    label: "Release",
    shortLabel: "Release",
    intent: "kilocode",
    defaultModel: "caval-auto/balanced",
    description: "Release Engineer — pipeline Windows real (release:win), fără installer fantomă",
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
    id: "debug",
    label: "Debug",
    shortLabel: "Debug",
    intent: "debug",
    defaultModel: "caval-auto/balanced",
    description: "Analizează erori și sugerează fix-uri",
  },
];

export function getAgentMode(id: AgentModeId | string): AgentMode {
  const normalized = id === "architect" ? "plan" : id;
  return AGENT_MODES.find((m) => m.id === normalized) ?? AGENT_MODES.find((m) => m.id === "code")!;
}

/** Multi-agent pipeline + full delivery — only in Agentic mode. */
export function isAgenticPipelineMode(mode: string | undefined): boolean {
  return mode === "agentic";
}

/** Autonomous Build Engine — file-first, auto-apply, consistency scan. */
export function isBuildEngineMode(mode: string | undefined): boolean {
  return mode === "build";
}

/** Release Engineer — orchestrates real release scripts, blocks on failed gates. */
export function isReleaseEngineerMode(mode: string | undefined): boolean {
  return mode === "release";
}

export interface CavalConfig {
  models?: {
    default?: ModelSelectionId;
    perMode?: Partial<Record<AgentModeId | "architect", ModelSelectionId>>;
  };
  cavalloModes?: CavalloModesConfig;
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
      code: "caval-auto/free",
      build: "caval-auto/balanced",
      release: "caval-auto/balanced",
      agentic: "caval-auto/balanced",
      plan: "caval-auto/frontier",
      debug: "caval-auto/balanced",
    },
  },
  cavalloModes: {
    autoModeSwitch: true,
    explicitTriggers: true,
  },
  autocomplete: {
    model: "north-mini-code",
    enabled: true,
  },
  mcp: { servers: [] },
};
