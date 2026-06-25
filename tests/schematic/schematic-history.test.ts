import { describe, expect, it } from "vitest";
import {
  createHistory,
  pushHistory,
  undo,
  redo,
  canUndo,
  canRedo,
} from "../../ai/schematic/schematic-history";
import { createEmptyGraph, createNode } from "../../ai/schematic/schematic-types";

describe("schematic-history", () => {
  it("supports undo and redo", () => {
    const g0 = createEmptyGraph("/w");
    let state = createHistory(g0);

    const g1 = { ...g0, nodes: [createNode({ id: "n1", type: "function", title: "f" })] };
    state = pushHistory(state, g1);
    expect(state.present.nodes).toHaveLength(1);
    expect(canUndo(state)).toBe(true);

    const undone = undo(state);
    expect(undone).not.toBeNull();
    expect(undone!.present.nodes).toHaveLength(0);
    expect(canRedo(undone!)).toBe(true);

    const redone = redo(undone!);
    expect(redone!.present.nodes).toHaveLength(1);
  });
});
