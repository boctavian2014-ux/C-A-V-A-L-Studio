import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ai/models/openrouter-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ai/models/openrouter-catalog")>();
  return {
    ...actual,
    fetchOpenRouterCatalog: vi.fn(async () => []),
  };
});

import {
  buildModelCatalog,
  invalidateCatalogCache,
} from "../../ai/models/model-catalog";
import {
  fetchOpenRouterCatalog,
  OPENROUTER_CATALOG_TTL_MS,
} from "../../ai/models/openrouter-catalog";

describe("buildModelCatalog TTL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:00:00.000Z"));
    invalidateCatalogCache();
    vi.mocked(fetchOpenRouterCatalog).mockClear();
    vi.mocked(fetchOpenRouterCatalog).mockResolvedValue([]);
  });

  afterEach(() => {
    invalidateCatalogCache();
    vi.useRealTimers();
  });

  it("returns cached snapshot within TTL without refetching OpenRouter", async () => {
    const first = await buildModelCatalog(false);
    expect(fetchOpenRouterCatalog).toHaveBeenCalledTimes(1);

    const second = await buildModelCatalog(false);
    expect(fetchOpenRouterCatalog).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it("rebuilds after TTL expires", async () => {
    const first = await buildModelCatalog(false);
    expect(fetchOpenRouterCatalog).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + OPENROUTER_CATALOG_TTL_MS);

    const second = await buildModelCatalog(false);
    expect(fetchOpenRouterCatalog).toHaveBeenCalledTimes(2);
    expect(second.fetchedAt).toBeGreaterThan(first.fetchedAt);
  });

  it("forceRefresh rebuilds even within TTL", async () => {
    await buildModelCatalog(false);
    expect(fetchOpenRouterCatalog).toHaveBeenCalledTimes(1);

    await buildModelCatalog(true);
    expect(fetchOpenRouterCatalog).toHaveBeenCalledTimes(2);
    expect(fetchOpenRouterCatalog).toHaveBeenLastCalledWith(true);
  });
});
