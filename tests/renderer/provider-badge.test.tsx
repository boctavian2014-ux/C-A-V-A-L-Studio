/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProviderBadge } from "../../src/renderer/components/engineering/ProviderBadge";
import {
  estimateZooCost,
  suggestCadProviderFromPrompt,
} from "../../src/shared/cad-zoo-contract";

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  act(() => {
    root?.render(ui);
  });
  return {
    container,
    unmount() {
      act(() => {
        root?.unmount();
        root = null;
      });
      container.remove();
    },
  };
}

describe("ProviderBadge", () => {
  let mounted: { unmount: () => void; container: HTMLElement } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it("shows Zoo with cost estimate", () => {
    const estimate = {
      provider: "zoo" as const,
      estimatedCostUsd: 0.02,
      confidence: "high" as const,
      notes: "$0.0083/sec × ~2.4s",
    };
    mounted = mount(
      <ProviderBadge provider="zoo" status="idle" costEstimate={estimate} showCost />
    );
    expect(mounted.container.textContent).toMatch(/Zoo/);
    expect(mounted.container.querySelector('[data-testid="provider-badge-cost"]')?.textContent).toBe(
      "~$0.02"
    );
    expect(
      mounted.container.querySelector('[data-testid="provider-badge-free-tier"]')
    ).toBeTruthy();
  });

  it("shows OpenSCAD without cost", () => {
    mounted = mount(<ProviderBadge provider="openscad" status="ready" showCost />);
    expect(mounted.container.textContent).toMatch(/OpenSCAD/);
    expect(mounted.container.querySelector('[data-testid="provider-badge-cost"]')).toBeNull();
  });

  it("hides cost when showCost=false", () => {
    const estimate = {
      provider: "zoo" as const,
      estimatedCostUsd: 0.02,
      confidence: "high" as const,
    };
    mounted = mount(
      <ProviderBadge provider="zoo" status="idle" costEstimate={estimate} showCost={false} />
    );
    expect(mounted.container.querySelector('[data-testid="provider-badge-cost"]')).toBeNull();
  });
});

describe("cad provider cost helpers", () => {
  it("estimates zoo cost from prompt length", () => {
    const estimate = estimateZooCost("suport telefon bicicleta clamp 22mm");
    expect(estimate.provider).toBe("zoo");
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
    expect(estimate.notes).toMatch(/0\.0083/);
  });

  it("suggests zoo for mechanical prompts and openscad for toy heli", () => {
    expect(suggestCadProviderFromPrompt("suport motor M3 40mm")).toBe("zoo");
    expect(suggestCadProviderFromPrompt("elicopter de jucarie")).toBe("openscad");
  });
});
