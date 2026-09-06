/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoboticsWelcome } from "../../src/renderer/components/engineering/RoboticsWelcome";

vi.mock("../../src/renderer/components/brand/CavaloHorseMark", () => ({
  CavalStudioHero: () => <div data-testid="caval-hero" />,
}));

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

describe("RoboticsWelcome", () => {
  let mounted: { unmount: () => void; container: HTMLElement } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it("shows steps for new users", () => {
    mounted = mount(<RoboticsWelcome onOpenFolder={() => {}} />);
    expect(mounted.container.textContent).toMatch(/Deschide un folder/);
    expect(mounted.container.textContent).toMatch(/Generează STL/);
    expect(mounted.container.querySelector('[data-testid="robotics-welcome"]')).toBeTruthy();
  });

  it("calls onOpenFolder when button clicked", () => {
    const onOpenFolder = vi.fn();
    mounted = mount(<RoboticsWelcome onOpenFolder={onOpenFolder} />);
    const btn = mounted.container.querySelector(
      '[data-testid="robotics-welcome-open-folder"]'
    ) as HTMLButtonElement;
    act(() => {
      btn.click();
    });
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });

  it("shows demo option when provided", () => {
    mounted = mount(
      <RoboticsWelcome onOpenFolder={() => {}} onDemoMode={() => {}} />
    );
    expect(mounted.container.querySelector('[data-testid="robotics-welcome-demo"]')).toBeTruthy();
    expect(mounted.container.textContent).toMatch(/Mod Demo/);
  });

  it("hides demo when not provided", () => {
    mounted = mount(<RoboticsWelcome onOpenFolder={() => {}} />);
    expect(mounted.container.querySelector('[data-testid="robotics-welcome-demo"]')).toBeNull();
  });
});
