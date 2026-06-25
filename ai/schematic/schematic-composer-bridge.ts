import type { ComposerPhase, ComposerPatchSet } from "../composer/types";
import { codeReviewApi } from "../review/code-review-api";
import { suggestionsApi } from "../suggestions/suggestions-api";
import type { SchematicGraph, SchematicGraphDelta } from "./schematic-types";

export interface SubmitSchematicPatchesOptions {
  skipSuggestions?: boolean;
  objective?: string;
}

export interface SubmitSchematicPatchesResult {
  phase: ComposerPhase;
  reviewSessionId?: string;
  suggestionsSessionId?: string;
}

/**
 * Routes schematic-derived patches into the existing AI pipeline:
 * Suggestions (optional) → Code Review → Apply.
 */
export async function submitSchematicPatches(
  workspaceRoot: string,
  patchSet: ComposerPatchSet,
  options: SubmitSchematicPatchesOptions = {}
): Promise<SubmitSchematicPatchesResult> {
  if (!options.skipSuggestions) {
    const bundle = await suggestionsApi.submitRequest(
      options.objective ?? `Schematic changes: ${patchSet.summary}`,
      workspaceRoot
    );
    return {
      phase: "awaiting_suggestions",
      suggestionsSessionId: bundle.id,
    };
  }

  const session = codeReviewApi.setPatches(workspaceRoot, patchSet);
  return {
    phase: "awaiting_review",
    reviewSessionId: session.id,
  };
}

export function buildSchematicComposerObjective(
  delta: SchematicGraphDelta,
  graph: SchematicGraph
): string {
  const parts = [
    `Apply schematic diagram changes to codebase.`,
    `Nodes: +${delta.addedNodes.length} -${delta.removedNodeIds.length} ~${delta.updatedNodes.length}`,
    `Edges: +${delta.addedEdges.length} -${delta.removedEdgeIds.length}`,
    `Graph has ${graph.nodes.length} nodes and ${graph.edges.length} edges.`,
  ];
  return parts.join(" ");
}
