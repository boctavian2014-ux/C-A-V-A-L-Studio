/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ai/i18n/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) => {
      if (key === "ai.research.understood") return "Am înțeles produsul";
      if (key === "ai.research.build") return "Construiește proiectul";
      if (key === "ai.research.unavailable") return "Research unavailable";
      if (key === "ai.research.inspiration") return `Inspirație analizată (${values?.count ?? 0})`;
      return key;
    },
  }),
}));

import { ProductResearchCard } from "../../ai/composer/ProductResearchCard";
import { detectProductIntentSync } from "../../ai/research/detect-product-intent";
import { buildProductResearchBrief } from "../../ai/research/product-brief";

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

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ProductResearchCard", () => {
  it("shows the compact brief and build CTA without a search button", () => {
    const intent = detectProductIntentSync("Creează landing page pentru salon cu rezervări");
    const brief = buildProductResearchBrief(
      intent,
      [
        {
          url: "https://web.dev/learn/design/",
          title: "web.dev",
          kind: "ux-pattern",
          note: "Conversion first.",
        },
      ],
      "unavailable"
    )!;
    const onBuild = vi.fn();
    const { container, unmount } = mount(
      <ProductResearchCard
        pending={{
          originalPrompt: "Creează landing page pentru salon cu rezervări",
          intent,
          brief,
          phase: "awaiting-confirm",
          messageId: "m1",
        }}
        onBuild={onBuild}
      />
    );
    expect(container.textContent).toMatch(/Am înțeles produsul/);
    expect(container.textContent).toMatch(/Construiește proiectul/);
    expect(container.textContent).toMatch(/Research unavailable/);
    expect(container.textContent).not.toMatch(/Search inspiration/i);
    const build = container.querySelector('[data-testid="product-research-build"]');
    act(() => {
      (build as HTMLButtonElement).click();
    });
    expect(onBuild).toHaveBeenCalledTimes(1);
    unmount();
  });
});
