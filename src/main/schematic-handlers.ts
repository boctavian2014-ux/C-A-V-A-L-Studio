import { ipcMain } from "electron";
import type { ComposerPatchSet } from "../../ai/composer/types";
import {
  buildSchematicComposerObjective,
  submitSchematicPatches,
} from "../../ai/schematic/schematic-composer-bridge";
import { schematicAI, createSampleGraph } from "../../ai/schematic/schematic-ai";
import type {
  SchematicGraph,
  SchematicGraphDelta,
} from "../../ai/schematic/schematic-types";
import { computeGraphDelta } from "../../ai/schematic/schematic-types";

function resolveWorkspaceRoot(root: string): string {
  if (!root || root === ".") return process.cwd();
  return root;
}

export interface SchematicGenerateFromCodeInput {
  workspaceRoot: string;
  files?: string[];
  objective?: string;
  useSample?: boolean;
}

export interface SchematicGenerateCodeInput {
  workspaceRoot: string;
  graph: SchematicGraph;
  delta: SchematicGraphDelta;
  skipSuggestions?: boolean;
}

export interface SchematicExplainInput {
  graph: SchematicGraph;
  nodeId?: string;
  edgeId?: string;
}

export const registerSchematicHandlers = (): void => {
  ipcMain.handle(
    "schematic:generateFromCode",
    async (_event, input: SchematicGenerateFromCodeInput) => {
      if (!input?.workspaceRoot) {
        return { ok: false, error: "workspaceRoot is required" };
      }
      if (input.useSample) {
        return { ok: true, graph: createSampleGraph(resolveWorkspaceRoot(input.workspaceRoot)) };
      }
      return schematicAI.generateFromCode({
        ...input,
        workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot),
      });
    }
  );

  ipcMain.handle("schematic:generateCode", async (_event, input: SchematicGenerateCodeInput) => {
    if (!input?.workspaceRoot || !input.graph) {
      return { ok: false, error: "workspaceRoot and graph are required" };
    }

    const gen = await schematicAI.generateCodeFromGraph({
      ...input,
      workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot),
    });
    if (!gen.ok || !gen.patchSet) {
      return { ok: false, error: gen.error ?? "Failed to generate patches" };
    }

    const pipeline = await submitSchematicPatches(resolveWorkspaceRoot(input.workspaceRoot), gen.patchSet, {
      skipSuggestions: input.skipSuggestions ?? false,
      objective: buildSchematicComposerObjective(input.delta, input.graph),
    });

    return {
      ok: true,
      patchSet: gen.patchSet,
      composerPhase: pipeline.phase,
      reviewSessionId: pipeline.reviewSessionId,
      suggestionsSessionId: pipeline.suggestionsSessionId,
    };
  });

  ipcMain.handle("schematic:explain", async (_event, input: SchematicExplainInput) => {
    if (!input?.graph) return { ok: false, error: "graph is required" };
    return schematicAI.explain(input);
  });

  ipcMain.handle("schematic:analyze", async (_event, input: { graph: SchematicGraph }) => {
    if (!input?.graph) return { ok: false, error: "graph is required" };
    return schematicAI.analyze(input);
  });

  ipcMain.handle("schematic:autoLayout", async (_event, input: { graph: SchematicGraph }) => {
    if (!input?.graph) return { ok: false, error: "graph is required" };
    return { ok: true, graph: schematicAI.autoLayout(input.graph) };
  });

  ipcMain.handle(
    "schematic:computeDelta",
    async (_event, input: { before: SchematicGraph; after: SchematicGraph }) => {
      if (!input?.before || !input?.after) {
        return { ok: false, error: "before and after graphs required" };
      }
      return { ok: true, delta: computeGraphDelta(input.before, input.after) };
    }
  );

  ipcMain.handle(
    "schematic:submitPatches",
    async (
      _event,
      input: {
        workspaceRoot: string;
        patchSet: ComposerPatchSet;
        skipSuggestions?: boolean;
        objective?: string;
      }
    ) => {
      if (!input?.workspaceRoot || !input.patchSet) {
        return { ok: false, error: "workspaceRoot and patchSet required" };
      }
      const result = await submitSchematicPatches(resolveWorkspaceRoot(input.workspaceRoot), input.patchSet, {
        skipSuggestions: input.skipSuggestions,
        objective: input.objective,
      });
      return { ok: true, ...result };
    }
  );
};
