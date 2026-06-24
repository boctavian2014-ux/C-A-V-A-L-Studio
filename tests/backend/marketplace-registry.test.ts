import { describe, expect, it } from "vitest";
import { MarketplaceRegistry } from "../../marketplace/server/registry";

describe("MarketplaceRegistry", () => {
  it("searches extensions by text and category", async () => {
    const registry = new MarketplaceRegistry();
    await registry.publish({
      id: "ext-1",
      name: "romania-tools",
      displayName: "Romania Tools",
      publisher: "caval",
      version: "1.0.0",
      description: "ANAF helpers",
      categories: ["romania"],
      vscodeCompatible: true,
      tags: ["romania"],
      downloads: 0,
      rating: 5,
      ratingCount: 1,
      featured: true,
      trendingScore: 10,
      cavalVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const results = await registry.search({ text: "anaf", category: "romania" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("romania-tools");
  });

  it("updates ratings and averages score", async () => {
    const registry = new MarketplaceRegistry();
    await registry.publish({
      id: "ext-2",
      name: "helper",
      displayName: "Helper",
      publisher: "caval",
      version: "1.0.0",
      description: "Helpful extension",
      categories: ["productivity"],
      vscodeCompatible: false,
      tags: [],
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      featured: false,
      trendingScore: 1,
      cavalVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await registry.rate({
      id: "r1",
      extensionId: "ext-2",
      userId: "u1",
      rating: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await registry.rate({
      id: "r2",
      extensionId: "ext-2",
      userId: "u2",
      rating: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const extension = await registry.get("ext-2");
    expect(extension?.ratingCount).toBe(2);
    expect(extension?.rating).toBe(3);
  });
});
