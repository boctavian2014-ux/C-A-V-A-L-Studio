import type { SchematicGraph } from "./schematic-types";

const MAX_HISTORY = 50;

export interface SchematicHistoryState {
  past: SchematicGraph[];
  present: SchematicGraph;
  future: SchematicGraph[];
}

export function createHistory(graph: SchematicGraph): SchematicHistoryState {
  return {
    past: [],
    present: cloneGraph(graph),
    future: [],
  };
}

export function cloneGraph(graph: SchematicGraph): SchematicGraph {
  return JSON.parse(JSON.stringify(graph)) as SchematicGraph;
}

export function pushHistory(
  state: SchematicHistoryState,
  next: SchematicGraph
): SchematicHistoryState {
  const present = cloneGraph(next);
  present.updatedAt = Date.now();
  const past = [...state.past, cloneGraph(state.present)].slice(-MAX_HISTORY);
  return { past, present, future: [] };
}

export function undo(state: SchematicHistoryState): SchematicHistoryState | null {
  if (state.past.length === 0) return null;
  const previous = state.past[state.past.length - 1]!;
  const past = state.past.slice(0, -1);
  const future = [cloneGraph(state.present), ...state.future].slice(0, MAX_HISTORY);
  return { past, present: cloneGraph(previous), future };
}

export function redo(state: SchematicHistoryState): SchematicHistoryState | null {
  if (state.future.length === 0) return null;
  const next = state.future[0]!;
  const future = state.future.slice(1);
  const past = [...state.past, cloneGraph(state.present)].slice(-MAX_HISTORY);
  return { past, present: cloneGraph(next), future };
}

export function canUndo(state: SchematicHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: SchematicHistoryState): boolean {
  return state.future.length > 0;
}
