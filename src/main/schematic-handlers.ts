import { ipcMain } from "electron";
import type { ComposerPatchSet } from "../../ai/composer/types";
import {
  buildSchematicComposerObjective,
  submitSchematicPatches,
} from "../../ai/schematic/schematic-composer-bridge";
import { schematicAI, createSampleGraph } from "../../ai/schematic/schematic-ai";
import type { HardwarePlanContext } from "../../ai/schematic/schematic-ai";
import type {
  SchematicGraph,
  SchematicGraphDelta,
} from "../../ai/schematic/schematic-types";
import { computeGraphDelta } from "../../ai/schematic/schematic-types";

export interface SchematicGenerateFromCodeInput {
  workspaceRoot?: string;
  files?: string[];
  objective?: string;
  useSample?: boolean;
  projectType?: string;
  planContext?: HardwarePlanContext;
}

export interface SchematicGenerateCodeInput {
  workspaceRoot?: string;
  graph: SchematicGraph;
  delta: SchematicGraphDelta;
  skipSuggestions?: boolean;
}

export interface SchematicExplainInput {
  graph: SchematicGraph;
  nodeId?: string;
  edgeId?: string;
}

export const registerSchematicHandlers = (
  getWorkspaceRoot: (senderId: number) => string
): void => {
  const resolveRoot = (senderId: number, inputRoot?: string): string => {
    if (inputRoot && inputRoot !== ".") return inputRoot;
    return getWorkspaceRoot(senderId);
  };

  ipcMain.handle(
    "schematic:generateFromCode",
    async (event, input: SchematicGenerateFromCodeInput) => {
      const workspaceRoot = resolveRoot(event.sender.id, input?.workspaceRoot);
      if (input?.useSample) {
        return { ok: true, graph: createSampleGraph(workspaceRoot) };
      }
      return schematicAI.generateFromCode({
        ...input,
        workspaceRoot,
      });
    }
  );

  ipcMain.handle("schematic:generateCode", async (event, input: SchematicGenerateCodeInput) => {
    if (!input?.graph) {
      return { ok: false, error: "graph is required" };
    }

    const workspaceRoot = resolveRoot(event.sender.id, input.workspaceRoot);

    const gen = await schematicAI.generateCodeFromGraph({
      ...input,
      workspaceRoot,
    });
    if (!gen.ok || !gen.patchSet) {
      return { ok: false, error: gen.error ?? "Failed to generate patches" };
    }

    const pipeline = await submitSchematicPatches(workspaceRoot, gen.patchSet, {
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
      event,
      input: {
        workspaceRoot?: string;
        patchSet: ComposerPatchSet;
        skipSuggestions?: boolean;
        objective?: string;
      }
    ) => {
      if (!input?.patchSet) {
        return { ok: false, error: "patchSet required" };
      }
      const workspaceRoot = resolveRoot(event.sender.id, input.workspaceRoot);
      const result = await submitSchematicPatches(workspaceRoot, input.patchSet, {
        skipSuggestions: input.skipSuggestions,
        objective: input.objective,
      });
      return { ok: true, ...result };
    }
  );
};
