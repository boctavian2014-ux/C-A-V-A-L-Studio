/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isTerminalAiPaletteEnabled,
  TERMINAL_AI_PALETTE,
} from "../../src/shared/ai-terminal-contract";
import { TerminalAiMenu } from "../../src/renderer/components/terminal/TerminalAiMenu";
import { TerminalAiCard } from "../../src/renderer/components/terminal/TerminalAiCard";

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

describe("7c.3 terminal AI menu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("disables Suggest fix without recent error; enables after", () => {
    const suggest = TERMINAL_AI_PALETTE.find((e) => e.id === "suggest-fix")!;
    expect(
      isTerminalAiPaletteEnabled(suggest, { hasSelection: false, hasRecentError: false })
    ).toBe(false);

    const onSelect = vi.fn();
    const disabled = mount(
      <TerminalAiMenu
        hasSelection={false}
        hasRecentError={false}
        onSelect={onSelect}
      />
    );
    const suggestBtn = disabled.container.querySelector(
      '[data-testid="terminal-ai-menu-suggest-fix"]'
    ) as HTMLButtonElement;
    expect(suggestBtn.disabled).toBe(true);
    act(() => {
      suggestBtn.click();
    });
    expect(onSelect).not.toHaveBeenCalled();
    disabled.unmount();

    const enabled = mount(
      <TerminalAiMenu hasSelection={false} hasRecentError={true} onSelect={onSelect} />
    );
    const suggestEnabled = enabled.container.querySelector(
      '[data-testid="terminal-ai-menu-suggest-fix"]'
    ) as HTMLButtonElement;
    expect(suggestEnabled.disabled).toBe(false);
    act(() => {
      suggestEnabled.click();
    });
    expect(onSelect).toHaveBeenCalledWith("suggest-fix");
    enabled.unmount();
  });

  it("disables Explain without selection; enables with selection", () => {
    const onSelect = vi.fn();
    const disabled = mount(
      <TerminalAiMenu hasSelection={false} hasRecentError={true} onSelect={onSelect} />
    );
    const explainBtn = disabled.container.querySelector(
      '[data-testid="terminal-ai-menu-explain"]'
    ) as HTMLButtonElement;
    expect(explainBtn.disabled).toBe(true);
    disabled.unmount();

    const enabled = mount(
      <TerminalAiMenu hasSelection={true} hasRecentError={false} onSelect={onSelect} />
    );
    const explainEnabled = enabled.container.querySelector(
      '[data-testid="terminal-ai-menu-explain"]'
    ) as HTMLButtonElement;
    expect(explainEnabled.disabled).toBe(false);
    act(() => {
      explainEnabled.click();
    });
    expect(onSelect).toHaveBeenCalledWith("explain");
    enabled.unmount();
  });

  it("Stop on shared card fires for both variants", () => {
    const onStopExplain = vi.fn();
    const onStopSuggest = vi.fn();

    const explain = mount(
      <TerminalAiCard variant="explain" state="loading" onStop={onStopExplain}>
        loading
      </TerminalAiCard>
    );
    act(() => {
      (
        explain.container.querySelector(
          '[data-testid="terminal-ai-explain-stop"]'
        ) as HTMLButtonElement
      ).click();
    });
    expect(onStopExplain).toHaveBeenCalledTimes(1);
    explain.unmount();

    const suggest = mount(
      <TerminalAiCard variant="suggest" state="loading" onStop={onStopSuggest}>
        loading
      </TerminalAiCard>
    );
    act(() => {
      (
        suggest.container.querySelector(
          '[data-testid="terminal-ai-suggest-stop"]'
        ) as HTMLButtonElement
      ).click();
    });
    expect(onStopSuggest).toHaveBeenCalledTimes(1);
    suggest.unmount();
  });
});
