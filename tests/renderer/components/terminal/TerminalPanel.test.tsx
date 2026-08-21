/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TerminalInput } from "../../../../src/renderer/components/terminal/TerminalInput";
import {
  mapTerminalUiStatus,
  shortTerminalTitle,
  TerminalSessions,
} from "../../../../src/renderer/components/terminal/TerminalPanel";
import type { TerminalApi, TerminalInfo, TerminalOutputLine } from "../../../../src/shared/terminal-contract";

function info(partial: Partial<TerminalInfo> & Pick<TerminalInfo, "id">): TerminalInfo {
  return {
    title: partial.title ?? partial.id,
    cwd: "/ws",
    shell: partial.shell ?? "PowerShell",
    status: "active",
    pid: 1,
    createdAt: 1,
    exitedAt: null,
    exitCode: null,
    ...partial,
  };
}

function createTerminalMock(initial: TerminalInfo[] = []) {
  const outputListeners: Array<(line: TerminalOutputLine) => void> = [];
  const exitListeners: Array<(next: TerminalInfo) => void> = [];
  const unsubscribeOutput = vi.fn();
  const unsubscribeExit = vi.fn();
  let created = 0;
  const sessions = new Map(initial.map((entry) => [entry.id, entry]));

  const api: TerminalApi = {
    list: vi.fn(async () => [...sessions.values()]),
    create: vi.fn(async (options) => {
      created += 1;
      const next = info({
        id: `term-${created}`,
        title: options?.title?.trim() || "PowerShell",
        shell: "PowerShell",
      });
      sessions.set(next.id, next);
      return next;
    }),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    destroy: vi.fn(async (id) => {
      sessions.delete(id);
    }),
    getInfo: vi.fn(async (id) => sessions.get(id) ?? info({ id })),
    onOutput: vi.fn((cb) => {
      outputListeners.push(cb);
      return unsubscribeOutput;
    }),
    onExit: vi.fn((cb) => {
      exitListeners.push(cb);
      return unsubscribeExit;
    }),
  };

  return { api, outputListeners, exitListeners, unsubscribeOutput, unsubscribeExit, sessions };
}

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

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(element, value);
  act(() => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("terminal tab helpers", () => {
  it("maps short titles for common shells", () => {
    expect(shortTerminalTitle({ title: "", shell: "PowerShell" })).toBe("PowerShell");
    expect(shortTerminalTitle({ title: "Terminal 1", shell: "pwsh.exe" })).toBe("PowerShell");
    expect(shortTerminalTitle({ title: "cmd.exe", shell: "cmd.exe" })).toBe("Command Prompt");
    expect(shortTerminalTitle({ title: "Task: dev", shell: "pwsh" })).toBe("Task: dev");
  });

  it("maps status to running/idle/error", () => {
    expect(mapTerminalUiStatus("active")).toBe("running");
    expect(mapTerminalUiStatus("exited")).toBe("idle");
    expect(mapTerminalUiStatus("failed")).toBe("error");
    expect(mapTerminalUiStatus("creating")).toBe("starting");
  });
});

describe("TerminalPanel", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  async function renderSessions(api: TerminalApi, isPanelActive = false) {
    window.caval = { terminal: api } as Window["caval"];
    const result = mount(<TerminalSessions isPanelActive={isPanelActive} />);
    mounted = result;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return result;
  }

  it("renders empty state without a New Terminal button when inactive", async () => {
    const { api } = createTerminalMock();
    const { container } = await renderSessions(api, false);
    expect(container.textContent).toContain("No terminals open.");
    expect(container.querySelector('[data-testid="terminal-empty"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="terminal-empty-new"]')).toBeNull();
    expect(container.textContent).not.toContain("New Terminal");
    expect(container.querySelector('[data-testid="terminal-tab-add"]')).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("opens a terminal by default when the TERMINAL panel becomes active", async () => {
    const { api } = createTerminalMock();
    window.caval = { terminal: api } as Window["caval"];
    const result = mount(<TerminalSessions isPanelActive={false} />);
    mounted = result;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.create).not.toHaveBeenCalled();

    act(() => {
      result.unmount();
    });
    const active = mount(<TerminalSessions isPanelActive />);
    mounted = active;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.create).toHaveBeenCalledWith({});
    expect(active.container.querySelector('[data-testid="terminal-tab-term-1"]')).toBeTruthy();
  });

  it("creates a named terminal with + and selects it", async () => {
    const { api } = createTerminalMock();
    const { container } = await renderSessions(api);
    const add = container.querySelector('[data-testid="terminal-tab-add"]');
    expect(add).toBeTruthy();
    await act(async () => {
      add?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.create).toHaveBeenCalledWith({});
    const tab = container.querySelector('[data-testid="terminal-tab-term-1"]');
    expect(tab?.className).toContain("active");
    expect(tab?.textContent).toContain("PowerShell");
    expect(tab?.getAttribute("aria-label")).toBe("Switch to PowerShell");
    expect(container.querySelector('[data-active-terminal-id="term-1"]')).toBeTruthy();
  });

  it("shows a toast and keeps empty when create fails", async () => {
    const { api } = createTerminalMock();
    api.create = vi.fn(async () => ({ ok: false, error: "Deschide un folder" }) as never);
    const { container } = await renderSessions(api);
    await act(async () => {
      container
        .querySelector('[data-testid="terminal-tab-add"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="terminal-empty"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="terminal-tab-term-1"]')).toBeNull();
  });

  it("shows tabs from list() and switches the active tab on click", async () => {
    const { api } = createTerminalMock([
      info({ id: "term-a", title: "Alpha" }),
      info({ id: "term-b", title: "Beta" }),
    ]);
    const { container } = await renderSessions(api);
    const alpha = container.querySelector('[data-testid="terminal-tab-term-a"]');
    const beta = container.querySelector('[data-testid="terminal-tab-term-b"]');
    expect(alpha?.className).toContain("active");
    expect(beta?.className).not.toContain("active");
    act(() => {
      beta?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="terminal-tab-term-b"]')?.className).toContain(
      "active"
    );
    expect(container.querySelector('[data-testid="terminal-tab-term-a"]')?.className).not.toContain(
      "active"
    );
    expect(container.querySelector('[data-active-terminal-id="term-b"]')).toBeTruthy();
  });

  it("activates a tab with Enter/Space", async () => {
    const { api } = createTerminalMock([
      info({ id: "term-a", title: "Alpha" }),
      info({ id: "term-b", title: "Beta" }),
    ]);
    const { container } = await renderSessions(api);
    const beta = container.querySelector('[data-testid="terminal-tab-term-b"]') as HTMLElement;
    act(() => {
      beta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(beta.className).toContain("active");
    act(() => {
      const alpha = container.querySelector('[data-testid="terminal-tab-term-a"]') as HTMLElement;
      alpha.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    expect(container.querySelector('[data-testid="terminal-tab-term-a"]')?.className).toContain(
      "active"
    );
  });

  it("closes an idle terminal without confirm, destroys PTY, and removes the tab", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api } = createTerminalMock([
      info({ id: "term-a", title: "Alpha", status: "exited", pid: null }),
      info({ id: "term-b", title: "Beta", status: "exited", pid: null }),
    ]);
    const { container } = await renderSessions(api);
    const close = container.querySelector(
      '[data-testid="terminal-tab-close-term-a"]'
    ) as HTMLButtonElement;
    expect(close.getAttribute("aria-label")).toBe("Close Alpha");
    await act(async () => {
      close.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(api.destroy).toHaveBeenCalledWith("term-a");
    expect(container.querySelector('[data-testid="terminal-tab-term-a"]')).toBeNull();
    expect(container.querySelector('[data-testid="terminal-tab-term-b"]')?.className).toContain(
      "active"
    );
  });

  it("asks for confirm on running close; Cancel leaves state unchanged", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { api } = createTerminalMock([info({ id: "term-a", title: "PowerShell", status: "active" })]);
    const { container } = await renderSessions(api);
    const close = container.querySelector('[data-testid="terminal-tab-close-term-a"]');
    await act(async () => {
      close?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.confirm).toHaveBeenCalled();
    expect(api.destroy).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="terminal-tab-term-a"]')).toBeTruthy();
    expect(container.querySelector('[data-active-terminal-id="term-a"]')).toBeTruthy();
  });

  it("Confirm Close destroys running PTY, clears output, and selects the next tab", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api, outputListeners } = createTerminalMock([
      info({ id: "term-a", title: "Alpha", status: "active" }),
      info({ id: "term-b", title: "Beta", status: "active" }),
    ]);
    const { container } = await renderSessions(api);
    act(() => {
      for (const listener of outputListeners) {
        listener({ terminalId: "term-a", data: "gone soon", timestamp: 1 });
      }
    });
    expect(container.querySelector('[data-testid="terminal-output"]')?.textContent).toContain(
      "gone soon"
    );
    await act(async () => {
      container
        .querySelector('[data-testid="terminal-tab-close-term-a"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.destroy).toHaveBeenCalledWith("term-a");
    expect(container.querySelector('[data-testid="terminal-tab-term-a"]')).toBeNull();
    expect(container.querySelector('[data-testid="terminal-tab-term-b"]')?.className).toContain(
      "active"
    );
    expect(container.querySelector('[data-active-terminal-id="term-b"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="terminal-output"]')?.textContent).not.toContain(
      "gone soon"
    );
  });

  it("closing the last terminal sets activeTerminalId null and shows empty state", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api } = createTerminalMock([info({ id: "term-a", title: "Solo", status: "active" })]);
    const { container } = await renderSessions(api);
    await act(async () => {
      container
        .querySelector('[data-testid="terminal-tab-close-term-a"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.destroy).toHaveBeenCalledWith("term-a");
    expect(container.querySelector('[data-testid="terminal-empty"]')).toBeTruthy();
    expect(container.querySelector('[data-active-terminal-id=""]')).toBeTruthy();
    expect(container.querySelector('[data-testid="terminal-tab-term-a"]')).toBeNull();
    // Must not auto-create a replacement terminal.
    expect(api.create).not.toHaveBeenCalled();
  });

  it("removes the tab from UI even when destroy rejects", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api } = createTerminalMock([info({ id: "term-a", title: "Solo", status: "active" })]);
    api.destroy = vi.fn(async () => {
      throw new Error("destroy failed");
    });
    const { container } = await renderSessions(api);
    await act(async () => {
      container
        .querySelector('[data-testid="terminal-tab-close-term-a"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.destroy).toHaveBeenCalledWith("term-a");
    expect(container.querySelector('[data-testid="terminal-tab-term-a"]')).toBeNull();
    expect(container.querySelector('[data-testid="terminal-empty"]')).toBeTruthy();
  });

  it("keeps Explain/Suggest wired to the active terminal id", async () => {
    const { api } = createTerminalMock([
      info({ id: "term-a", title: "Alpha" }),
      info({ id: "term-b", title: "Beta" }),
    ]);
    const { container } = await renderSessions(api);
    act(() => {
      container
        .querySelector('[data-testid="terminal-tab-term-b"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-active-terminal-id="term-b"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="terminal-explain-btn"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="terminal-suggest-btn"]')).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
  });

  it("appends onOutput lines to the active tab", async () => {
    const { api, outputListeners } = createTerminalMock([info({ id: "term-a", title: "Alpha" })]);
    const { container } = await renderSessions(api);
    act(() => {
      for (const listener of outputListeners) {
        listener({ terminalId: "term-a", data: "hello from pty", timestamp: 10 });
      }
    });
    expect(container.querySelector('[data-testid="terminal-output"]')?.textContent).toContain(
      "hello from pty"
    );
  });

  it("filters output with the search box", async () => {
    const { api, outputListeners } = createTerminalMock([info({ id: "term-a", title: "Alpha" })]);
    const { container } = await renderSessions(api);
    act(() => {
      for (const listener of outputListeners) {
        listener({ terminalId: "term-a", data: "keep this line", timestamp: 1 });
        listener({ terminalId: "term-a", data: "drop that row", timestamp: 2 });
      }
    });
    const search = container.querySelector('[data-testid="terminal-search"]') as HTMLInputElement;
    setInputValue(search, "keep");
    const output = container.querySelector('[data-testid="terminal-output"]')?.textContent ?? "";
    expect(output).toContain("keep this line");
    expect(output).not.toContain("drop that row");
  });

  it("updates tab status on onExit", async () => {
    const { api, exitListeners } = createTerminalMock([info({ id: "term-a", title: "Alpha" })]);
    const { container } = await renderSessions(api);
    act(() => {
      for (const listener of exitListeners) {
        listener(info({ id: "term-a", title: "Alpha", status: "exited", exitCode: 0, exitedAt: 2 }));
      }
    });
    expect(container.querySelector('[aria-label="Status: idle"]')).toBeTruthy();
  });

  it("unsubscribes output and exit listeners on unmount", async () => {
    const { api, unsubscribeOutput, unsubscribeExit } = createTerminalMock();
    const { unmount } = await renderSessions(api);
    unmount();
    mounted = undefined;
    expect(unsubscribeOutput).toHaveBeenCalled();
    expect(unsubscribeExit).toHaveBeenCalled();
  });

  it("keeps only the last 1000 output lines per terminal", async () => {
    const { api, outputListeners } = createTerminalMock([info({ id: "term-a", title: "Alpha" })]);
    const { container } = await renderSessions(api);
    act(() => {
      for (const listener of outputListeners) {
        for (let i = 0; i < 1005; i += 1) {
          listener({ terminalId: "term-a", data: `line-${i}`, timestamp: i });
        }
      }
    });
    const lines = Array.from(container.querySelectorAll(".terminal-line")).map(
      (node) => node.textContent
    );
    expect(lines).toHaveLength(1000);
    expect(lines[0]).toBe("line-5");
    expect(lines[999]).toBe("line-1004");
    expect(lines).not.toContain("line-4");
  });
});

describe("TerminalInput", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it("sends the command on Enter and walks history with arrows", async () => {
    const onInput = vi.fn(async () => undefined);
    const result = mount(
      <TerminalInput terminalId="term-1" onInput={onInput} disabled={false} />
    );
    mounted = result;
    const input = result.container.querySelector('[data-testid="terminal-input"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    setInputValue(input, "ls");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();
    });
    expect(onInput).toHaveBeenCalledWith("ls\n");
    expect(input.value).toBe("");

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(input.value).toBe("ls");

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(input.value).toBe("");
  });
});
