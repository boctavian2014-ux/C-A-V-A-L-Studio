import { describe, expect, it } from "vitest";

import {
  buildUniversalWebContext,
  detectSoftwareCategories,
  mergeProjectContextWithWebContext,
  searchCategoryContext,
} from "../../ai/tools/auto-web-context";
import { detectPlatforms, formatPlatformContextBlock } from "../../ai/tools/platform-context";
import { SOFTWARE_TRENDS_2026 } from "../../ai/data/software-trends-2026";

describe("detectSoftwareCategories", () => {
  it("detects web landing / ecommerce / dashboard", () => {
    expect(detectSoftwareCategories("Build a landing page with dark mode")[0]?.category).toBe(
      "web"
    );
    expect(
      detectSoftwareCategories("Create an ecommerce storefront with checkout")[0]?.category
    ).toBe("web");
    expect(detectSoftwareCategories("Make a SaaS analytics dashboard")[0]?.category).toBe("web");
  });

  it("detects mobile ios/android/rn/flutter", () => {
    expect(detectSoftwareCategories("iOS app with SwiftUI onboarding")[0]?.category).toBe(
      "mobile"
    );
    expect(detectSoftwareCategories("Android Jetpack Compose feed")[0]?.category).toBe("mobile");
    expect(detectSoftwareCategories("React Native mobile app")[0]?.category).toBe("mobile");
    expect(detectSoftwareCategories("Flutter mobile UI for fitness")[0]?.category).toBe("mobile");
  });

  it("detects desktop / cli / api", () => {
    expect(detectSoftwareCategories("Electron desktop app for notes")[0]?.category).toBe(
      "desktop"
    );
    expect(detectSoftwareCategories("CLI tool to convert CSV files")[0]?.category).toBe("cli");
    expect(detectSoftwareCategories("REST API microservice with OpenAPI")[0]?.category).toBe(
      "api"
    );
  });

  it("detects game / ai-ml / blockchain / iot / database", () => {
    expect(detectSoftwareCategories("2D game with Phaser")[0]?.category).toBe("game");
    expect(
      detectSoftwareCategories("machine learning model training pipeline")[0]?.category
    ).toBe("ai-ml");
    expect(detectSoftwareCategories("Solidity smart contract for NFT")[0]?.category).toBe(
      "blockchain"
    );
    expect(detectSoftwareCategories("IoT Arduino sensor MQTT dashboard")[0]?.facets).toContain(
      "iot"
    );
    expect(
      detectSoftwareCategories("PostgreSQL schema design and SQL migrations")[0]?.category
    ).toBe("database");
  });

  it("returns empty for unrelated short text", () => {
    expect(detectSoftwareCategories("hi")).toEqual([]);
    expect(detectSoftwareCategories("what is 2+2?")).toEqual([]);
  });
});

describe("searchCategoryContext", () => {
  it("returns relevant hits per category", () => {
    for (const category of Object.keys(SOFTWARE_TRENDS_2026) as Array<
      keyof typeof SOFTWARE_TRENDS_2026
    >) {
      const hits = searchCategoryContext(category, "design patterns performance", 5);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.text.length).toBeGreaterThan(8);
    }
  });
});

describe("platform-context", () => {
  it("detects ios and android", () => {
    const ios = detectPlatforms("Build an iPhone SwiftUI app with App Store guidelines");
    expect(ios[0]?.platform).toBe("ios");
    const android = detectPlatforms("Material Design Android Jetpack Compose app");
    expect(android[0]?.platform).toBe("android");
  });

  it("formats platform block", () => {
    const block = formatPlatformContextBlock(detectPlatforms("Windows WinUI Fluent desktop"));
    expect(block).toMatch(/Windows|Fluent/i);
  });
});

describe("buildUniversalWebContext", () => {
  it("injects context for create intents with force", () => {
    const ctx = buildUniversalWebContext("Create a Next.js landing page website", {
      force: true,
    });
    expect(ctx.primary).toBe("web");
    expect(ctx.contextBlock).toMatch(/Universal software context/);
    expect(ctx.contextBlock).toMatch(/Web/);
    expect(ctx.searchHits.length).toBeGreaterThan(0);
  });

  it("includes platform guidance when mentioned", () => {
    const ctx = buildUniversalWebContext("Build an iOS mobile app with SwiftUI", {
      force: true,
    });
    expect(ctx.primary).toBe("mobile");
    expect(ctx.contextBlock).toMatch(/iOS|Human Interface/i);
  });

  it("merge appends without dropping existing context", () => {
    const ctx = buildUniversalWebContext("REST API backend with GraphQL gateway", {
      force: true,
    });
    const merged = mergeProjectContextWithWebContext("Local file: src/index.ts", ctx);
    expect(merged).toContain("Local file");
    expect(merged).toContain("Universal software context");
  });

  it("skips weak ask-only prompts without force", () => {
    const ctx = buildUniversalWebContext("explain react hooks briefly");
    expect(ctx.contextBlock).toBe("");
  });

  it("injects DESIGN CONTRACT + snippets for landing page premium", () => {
    const ctx = buildUniversalWebContext("landing page premium");
    expect(ctx.primary).toBe("web");
    expect(ctx.designContractApplied).toBe(true);
    expect(ctx.contextBlock).toMatch(/DESIGN CONTRACT \(MANDATORY/);
    expect(ctx.designSnippets.length).toBeGreaterThanOrEqual(1);
    expect(ctx.contextBlock).toMatch(/hero-modern|pricing-cards|navbar-glass/);
  });

  it("does not inject design contract for REST API prompts", () => {
    const ctx = buildUniversalWebContext("creează un REST API", { force: true });
    expect(ctx.primary).toBe("api");
    expect(ctx.designContractApplied).toBe(false);
    expect(ctx.contextBlock).not.toMatch(/DESIGN CONTRACT \(MANDATORY/);
    expect(ctx.designSnippets).toEqual([]);
  });
});

describe("design snippets corpus", () => {
  it("exports valid Tailwind HTML fragments", async () => {
    const { DESIGN_SNIPPETS_2026 } = await import("../../ai/data/design-snippets-2026");
    for (const snip of Object.values(DESIGN_SNIPPETS_2026)) {
      expect(snip.html).toMatch(/class=/);
      expect(snip.html).toMatch(
        /\b(flex|grid|rounded|px-|py-|bg-|text-|max-w-|gap-|border)\b/
      );
      expect(snip.html).not.toMatch(/<script(?![^>]*tailwind)/i);
    }
  });
});
