import { describe, expect, it } from "vitest";

import { takeLast } from "../../../src/renderer/lib/panel-limits";

describe("takeLast", () => {
  it("keeps the tail when the list exceeds max", () => {
    expect(takeLast([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });

  it("copies a list that already fits", () => {
    const src = [1, 2];
    const next = takeLast(src, 3);
    expect(next).toEqual([1, 2]);
    expect(next).not.toBe(src);
  });
});
