// ──────────────────────────────────────────────
//  Agent modes — CAVALLO Enterprise + Agentic
// ──────────────────────────────────────────────

import type { RoutingIntent } from "../types";
import type { ModelSelectionId } from "../models/model-catalog";
import type { CavalloModesConfig } from "./mode-router";

export type AgentModeId = "ask" | "plan" | "code" | "debug" | "agentic";

export interface AgentMode {
  id: AgentModeId;
  label: string;
  shortLabel: string;
  intent: RoutingIntent;
  defaultModel: ModelSelectionId;
  description: string;
}

/** UI order: Ask → Plan → Code → Debug → Agentic */
export const AGENT_MODES: AgentMode[] = [
  {
    id: "ask",
    label: "Ask",
    shortLabel: "Ask",
    intent: "fallback",
    defaultModel: "caval-auto/balanced",
    description: "Întrebări rapide, explicații, fără modificări de cod",
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
    id: "debug",
    label: "Debug",
    shortLabel: "Debug",
    intent: "debug",
    defaultModel: "caval-auto/balanced",
    description: "Analizează erori și sugerează fix-uri",
  },
  {
    id: "agentic",
    label: "Agentic",
    shortLabel: "Agentic",
    intent: "kilocode",
    defaultModel: "caval-auto/balanced",
    description: "Pipeline complet — de la idee la proiect livrat",
  },
];

export function getAgentMode(id: AgentModeId | string): AgentMode {
  const normalized = id === "architect" ? "plan" : id === "build" || id === "release" ? "code" : id;
  return AGENT_MODES.find((m) => m.id === normalized) ?? AGENT_MODES.find((m) => m.id === "code")!;
}

/** Multi-agent pipeline + full delivery — only in Agentic mode. */
export function isAgenticPipelineMode(mode: string | undefined): boolean {
  return mode === "agentic";
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
      agentic: "caval-auto/balanced",
      plan: "caval-auto/frontier",
      debug: "caval-auto/balanced",
    },
  },
  cavalloModes: {
    autoModeSwitch: true,
    explicitTriggers: true,
    modesTestUseLlm: false,
    enforceEndLabels: true,
  },
  autocomplete: {
    model: "north-mini-code",
    enabled: true,
  },
  mcp: {
    servers: [
      {
        id: "filesystem",
        name: "Filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
        enabled: true,
      },
      {
        id: "git",
        name: "Git",
        command: "uvx",
        args: ["mcp-server-git", "--repository", "."],
        enabled: true,
      },
      {
        id: "fetch",
        name: "Fetch",
        command: "uvx",
        args: ["mcp-server-fetch"],
        enabled: true,
      },
      {
        id: "memory",
        name: "Memory",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-memory"],
        enabled: true,
      },
      {
        id: "firecrawl",
        name: "Firecrawl",
        command: "npx",
        args: ["-y", "firecrawl-mcp"],
        enabled: false,
      },
      {
        id: "postgres",
        name: "Postgres (Supabase / Neon)",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://USER:PASS@HOST/DB"],
        enabled: false,
      },
      {
        id: "github",
        name: "GitHub (read-only)",
        command: "docker",
        args: [
          "run", "-i", "--rm",
          "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
          "-e", "GITHUB_READ_ONLY",
          "-e", "GITHUB_TOOLSETS",
          "ghcr.io/github/github-mcp-server",
        ],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: "",
          GITHUB_READ_ONLY: "1",
          GITHUB_TOOLSETS: "context,repos,issues,pull_requests,code_security",
        },
        enabled: true,
      },
      {
        id: "semgrep",
        name: "Semgrep Security",
        command: "uvx",
        args: ["--from", "semgrep", "semgrep", "mcp"],
        enabled: true,
      },
      {
        id: "trivy",
        name: "Trivy Supply Chain",
        command: "trivy",
        args: ["mcp"],
        enabled: true,
      },
    ],
  },
};
