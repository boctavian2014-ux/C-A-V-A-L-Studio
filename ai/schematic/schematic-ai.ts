import fs from "node:fs";
import path from "node:path";
import { AIClient } from "../ai-client";
import { ContextExpander } from "../composer/context/context-expander";
import type { ComposerPatchSet } from "../composer/types";
import { analyzeSchematicGraph } from "./schematic-analysis";
import { autoLayoutGraph } from "./schematic-layout";
import type {
  SchematicAnalysisIssue,
  SchematicGraph,
  SchematicGraphDelta,
  SchematicNode,
} from "./schematic-types";
import {
  SCHEMATIC_VERSION,
  colorForNodeType,
  createEmptyGraph,
  createNode,
  defaultPinsForType,
  validateSchematicGraph,
} from "./schematic-types";

const PROMPTS_DIR = path.join(process.cwd(), "ai", "schematic", "prompts");

function loadPrompt(filename: string): string {
  try {
    return fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf8");
  } catch {
    return "";
  }
}

function extractJson<T>(content: string): T | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? content.trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    const arrStart = raw.indexOf("[");
    const arrEnd = raw.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        return JSON.parse(raw.slice(arrStart, arrEnd + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function graphFromSymbols(
  workspaceRoot: string,
  files: string[],
  symbols: Array<{ name: string; kind: string; file: string; line?: number }>
): SchematicGraph {
  const graph = createEmptyGraph(workspaceRoot);
  graph.source.files = files;

  const nodes: SchematicNode[] = symbols.slice(0, 24).map((sym, i) => {
    const type =
      sym.kind === "class" || sym.kind === "interface" || sym.kind === "type"
        ? "class"
        : sym.kind === "const"
          ? "data_structure"
          : "function";
    return createNode({
      id: `sym-${i}-${sym.name}`,
      type,
      title: sym.name,
      description: `${sym.kind} in ${sym.file}`,
      position: { x: (i % 6) * 220, y: Math.floor(i / 6) * 100 },
      pins: defaultPinsForType(type),
      metadata: {
        sourceFile: sym.file,
        symbolId: sym.name,
        lineRange: sym.line ? [sym.line, sym.line] : undefined,
        zoomLevel: type === "class" ? "class" : "function",
      },
      color: colorForNodeType(type),
    });
  });

  graph.nodes = nodes;
  for (let i = 0; i < nodes.length - 1; i++) {
    graph.edges.push({
      id: `edge-sym-${i}`,
      source: nodes[i]!.id,
      target: nodes[i + 1]!.id,
      type: "dependency",
      direction: "forward",
      weight: 1.5,
      glow: false,
      tooltip: "inferred dependency",
    });
  }

  return autoLayoutGraph(graph);
}

export interface HardwarePlanContext {
  requirements?: string;
  components?: string;
  circuit?: string;
  assembly?: string;
}

export function graphFromHardwarePlan(input: {
  workspaceRoot: string;
  projectType?: string;
  objective?: string;
  planContext?: HardwarePlanContext;
}): SchematicGraph {
  const graph = createEmptyGraph(input.workspaceRoot);
  const projectType = input.projectType ?? 'custom';

  if (projectType === 'drone') {
    const nodeDefs: Array<{ id: string; type: SchematicNode['type']; title: string; desc: string }> = [
      { id: 'hw-battery', type: 'data_structure', title: 'Battery 4S', desc: 'LiPo power source' },
      { id: 'hw-esc', type: 'module', title: '4-in-1 ESC', desc: 'Motor drivers + PDB' },
      { id: 'hw-fc', type: 'module', title: 'Flight Controller', desc: 'Gyro, PID, UART' },
      { id: 'hw-motors', type: 'module', title: 'Motors 2207', desc: '4x brushless motors' },
      { id: 'hw-vtx', type: 'module', title: 'VTX', desc: 'Video transmitter' },
      { id: 'hw-cam', type: 'module', title: 'FPV Camera', desc: 'Analog/HD camera' },
      { id: 'hw-rx', type: 'module', title: 'Receiver ELRS', desc: 'RC link' },
      { id: 'hw-frame', type: 'module', title: 'Frame 5"', desc: 'Carbon frame + arms' },
    ];
    graph.nodes = nodeDefs.map((n, i) =>
      createNode({
        id: n.id,
        type: n.type,
        title: n.title,
        description: n.desc,
        position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 120 },
        metadata: { zoomLevel: 'module', aiNotes: 'FPV drone block' },
      })
    );
    graph.edges = [
      { id: 'e-bat-esc', source: 'hw-battery', target: 'hw-esc', type: 'data_flow', direction: 'forward', weight: 2, glow: true, tooltip: 'power' },
      { id: 'e-esc-mot', source: 'hw-esc', target: 'hw-motors', type: 'data_flow', direction: 'forward', weight: 2, glow: false, tooltip: 'motor power' },
      { id: 'e-fc-esc', source: 'hw-fc', target: 'hw-esc', type: 'call', direction: 'forward', weight: 1.5, glow: false, tooltip: 'DShot/PWM' },
      { id: 'e-fc-rx', source: 'hw-rx', target: 'hw-fc', type: 'data_flow', direction: 'forward', weight: 1.5, glow: false, tooltip: 'CRSF' },
      { id: 'e-fc-vtx', source: 'hw-fc', target: 'hw-vtx', type: 'call', direction: 'forward', weight: 1, glow: false, tooltip: 'SmartAudio' },
      { id: 'e-cam-vtx', source: 'hw-cam', target: 'hw-vtx', type: 'data_flow', direction: 'forward', weight: 1.5, glow: false, tooltip: 'video' },
      { id: 'e-frame-all', source: 'hw-frame', target: 'hw-fc', type: 'dependency', direction: 'forward', weight: 1, glow: false, tooltip: 'mechanical mount' },
    ];
    graph.source.files = [];
    return autoLayoutGraph(graph);
  }

  const summary = [
    input.objective,
    input.planContext?.requirements?.slice(0, 200),
    input.planContext?.components?.slice(0, 200),
  ]
    .filter(Boolean)
    .join(' — ');

  graph.nodes = [
    createNode({
      id: 'hw-plan',
      type: 'module',
      title: 'Hardware Plan',
      description: summary || 'Generated from engineering plan',
      position: { x: 0, y: 0 },
      metadata: { zoomLevel: 'module' },
    }),
  ];
  return autoLayoutGraph(graph);
}

export class SchematicAI {
  constructor(
    private readonly ai = new AIClient(),
    private readonly contextExpander = new ContextExpander()
  ) {}

  async generateFromCode(input: {
    workspaceRoot: string;
    files?: string[];
    objective?: string;
    projectType?: string;
    planContext?: HardwarePlanContext;
  }): Promise<{ ok: boolean; graph?: SchematicGraph; error?: string }> {
    const objective = input.objective ?? "Generate system schematic from workspace code";
    const hasPlan =
      Boolean(input.planContext?.requirements?.trim()) ||
      Boolean(input.planContext?.circuit?.trim()) ||
      Boolean(input.planContext?.components?.trim());

    if (hasPlan || input.projectType === 'drone' || input.projectType === 'robot') {
      try {
        const system = [loadPrompt("schematic-system.md"), loadPrompt("schematic-transform.md")]
          .filter(Boolean)
          .join("\n\n");

        const response = await this.ai.complete({
          capability: "reasoning",
          intent: "codebase",
          system,
          prompt: [
            objective,
            `Project type: ${input.projectType ?? 'custom'}`,
            `Hardware plan requirements:\n${input.planContext?.requirements?.slice(0, 800) ?? ''}`,
            `Components:\n${input.planContext?.components?.slice(0, 600) ?? ''}`,
            `Circuit:\n${input.planContext?.circuit?.slice(0, 600) ?? ''}`,
            `Assembly:\n${input.planContext?.assembly?.slice(0, 400) ?? ''}`,
            'Return JSON SchematicGraph with version "caval-schematic-v1". Use hardware blocks (Battery, ESC, FC, Motors, etc.) for drones.',
          ].join("\n"),
          metadata: { workspaceRoot: input.workspaceRoot },
        });

        const parsed = extractJson<SchematicGraph>(response.content);
        if (parsed && validateSchematicGraph(parsed) && parsed.nodes.length > 0) {
          parsed.source = { workspaceRoot: input.workspaceRoot, files: input.files ?? [] };
          return { ok: true, graph: autoLayoutGraph(parsed) };
        }
      } catch {
        // fall through to template
      }

      const fromPlan = graphFromHardwarePlan({
        workspaceRoot: input.workspaceRoot,
        projectType: input.projectType,
        objective,
        planContext: input.planContext,
      });
      if (fromPlan.nodes.length > 0) {
        return { ok: true, graph: fromPlan };
      }
    }

    try {
      const context = await this.contextExpander.expand(objective, input.workspaceRoot);
      const files = input.files?.length ? input.files : context.relevantFiles;

      const system = [loadPrompt("schematic-system.md"), loadPrompt("schematic-transform.md")]
        .filter(Boolean)
        .join("\n\n");

      const response = await this.ai.complete({
        capability: "reasoning",
        intent: "codebase",
        system,
        prompt: [
          objective,
          `Workspace: ${input.workspaceRoot}`,
          `Files: ${files.join(", ")}`,
          `Symbols: ${JSON.stringify(context.symbols.slice(0, 40))}`,
          `Notes: ${context.notes.join("; ")}`,
          'Return JSON SchematicGraph with version "caval-schematic-v1".',
        ].join("\n"),
        metadata: { workspaceRoot: input.workspaceRoot },
      });

      const parsed = extractJson<SchematicGraph>(response.content);
      if (parsed && validateSchematicGraph(parsed)) {
        parsed.source = { workspaceRoot: input.workspaceRoot, files };
        return { ok: true, graph: autoLayoutGraph(parsed) };
      }

      const fallback = graphFromSymbols(
        input.workspaceRoot,
        files,
        context.symbols.map((s) => ({
          name: s.name,
          kind: s.kind,
          file: s.file,
          line: s.line,
        }))
      );
      if (fallback.nodes.length > 0) {
        return { ok: true, graph: fallback };
      }

      const fromPlan = graphFromHardwarePlan({
        workspaceRoot: input.workspaceRoot,
        projectType: input.projectType,
        objective,
        planContext: input.planContext,
      });
      return { ok: true, graph: fromPlan.nodes.length > 0 ? fromPlan : fallback };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async generateCodeFromGraph(input: {
    workspaceRoot: string;
    graph: SchematicGraph;
    delta: SchematicGraphDelta;
  }): Promise<{ ok: boolean; patchSet?: ComposerPatchSet; error?: string }> {
    try {
      const system = [loadPrompt("schematic-system.md"), loadPrompt("schematic-generate-code.md")]
        .filter(Boolean)
        .join("\n\n");

      const response = await this.ai.complete({
        capability: "patching",
        intent: "multi_file",
        system,
        prompt: [
          `Workspace: ${input.workspaceRoot}`,
          `Graph summary: ${input.graph.nodes.length} nodes, ${input.graph.edges.length} edges`,
          `Delta: ${JSON.stringify(input.delta)}`,
          "Return ComposerPatchSet JSON only.",
        ].join("\n"),
        metadata: { workspaceRoot: input.workspaceRoot },
      });

      const patchSet = extractJson<ComposerPatchSet>(response.content);
      if (!patchSet?.files) {
        return { ok: false, error: "AI did not return valid patch set" };
      }
      return {
        ok: true,
        patchSet: {
          summary: patchSet.summary ?? "Schematic-derived code changes",
          files: patchSet.files,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async explain(input: {
    graph: SchematicGraph;
    nodeId?: string;
    edgeId?: string;
  }): Promise<{ ok: boolean; content?: string; error?: string }> {
    try {
      const system = [loadPrompt("schematic-system.md"), loadPrompt("schematic-explain.md")]
        .filter(Boolean)
        .join("\n\n");

      const focus = input.nodeId
        ? input.graph.nodes.find((n) => n.id === input.nodeId)
        : input.edgeId
          ? input.graph.edges.find((e) => e.id === input.edgeId)
          : null;

      const response = await this.ai.complete({
        capability: "reasoning",
        intent: "reasoning",
        system,
        prompt: [
          `Explain this schematic element:`,
          JSON.stringify(focus ?? { overview: "full graph", nodes: input.graph.nodes.length }),
          `Full graph edges: ${JSON.stringify(input.graph.edges.slice(0, 20))}`,
        ].join("\n"),
      });

      return { ok: true, content: response.content };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async analyze(input: {
    graph: SchematicGraph;
  }): Promise<{ ok: boolean; issues: SchematicAnalysisIssue[]; error?: string }> {
    const deterministic = analyzeSchematicGraph(input.graph);

    try {
      const system = [loadPrompt("schematic-system.md"), loadPrompt("schematic-analyze.md")]
        .filter(Boolean)
        .join("\n\n");

      const response = await this.ai.complete({
        capability: "reasoning",
        intent: "codebase",
        system,
        prompt: `Analyze graph: ${JSON.stringify({ nodes: input.graph.nodes.length, edges: input.graph.edges.length })}`,
      });

      const aiIssues = extractJson<SchematicAnalysisIssue[]>(response.content) ?? [];
      const merged = [...deterministic];
      for (const issue of aiIssues) {
        if (!merged.some((m) => m.id === issue.id)) merged.push(issue);
      }
      return { ok: true, issues: merged };
    } catch {
      return { ok: true, issues: deterministic };
    }
  }

  autoLayout(graph: SchematicGraph): SchematicGraph {
    return autoLayoutGraph(graph);
  }
}

export const schematicAI = new SchematicAI();

export function createSampleGraph(workspaceRoot: string): SchematicGraph {
  const graph = createEmptyGraph(workspaceRoot);
  const nodes = [
    createNode({ id: "mod-main", type: "module", title: "Main Module", position: { x: 0, y: 0 }, metadata: { zoomLevel: "module" } }),
    createNode({ id: "cls-app", type: "class", title: "AppController", position: { x: 0, y: 0 }, metadata: { zoomLevel: "class" } }),
    createNode({ id: "fn-init", type: "function", title: "initialize()", position: { x: 0, y: 0 }, metadata: { zoomLevel: "function" } }),
    createNode({ id: "api-health", type: "api_endpoint", title: "GET /health", position: { x: 0, y: 0 }, metadata: { zoomLevel: "function" } }),
    createNode({ id: "agent-ai", type: "ai_agent", title: "Schematic AI", position: { x: 0, y: 0 }, metadata: { zoomLevel: "function", aiNotes: "Generates schematics" } }),
  ];
  graph.nodes = nodes;
  graph.edges = [
    { id: "e1", source: "mod-main", target: "cls-app", type: "dependency", direction: "forward", weight: 2, glow: true, tooltip: "contains" },
    { id: "e2", source: "cls-app", target: "fn-init", type: "call", direction: "forward", weight: 1.5, glow: false, tooltip: "calls" },
    { id: "e3", source: "fn-init", target: "api-health", type: "data_flow", direction: "forward", weight: 1.5, glow: false, tooltip: "registers route" },
    { id: "e4", source: "agent-ai", target: "fn-init", type: "ai_reasoning", direction: "forward", weight: 1, glow: true, tooltip: "AI orchestration" },
  ];
  graph.version = SCHEMATIC_VERSION;
  return autoLayoutGraph(graph);
}
