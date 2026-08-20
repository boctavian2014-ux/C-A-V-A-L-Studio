/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TerminalInput } from "../../../../src/renderer/components/terminal/TerminalInput";
import { TerminalSessions } from "../../../../src/renderer/components/terminal/TerminalPanel";
import type { TerminalApi, TerminalInfo, TerminalOutputLine } from "../../../../src/shared/terminal-contract";

function info(partial: Partial<TerminalInfo> & Pick<TerminalInfo, "id">): TerminalInfo {
  return {
    title: partial.title ?? partial.id,
    cwd: "/ws",
    shell: "pwsh",
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

  const api: TerminalApi = {
    list: vi.fn(async () => initial),
    create: vi.fn(async (options) => {
      created += 1;
      return info({
        id: `term-${created}`,
        title: options?.title ?? `term-${created}`,
      });
    }),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
    getInfo: vi.fn(async (id) => info({ id })),
    onOutput: vi.fn((cb) => {
      outputListeners.push(cb);
      return unsubscribeOutput;
    }),
    onExit: vi.fn((cb) => {
      exitListeners.push(cb);
      return unsubscribeExit;
    }),
  };

  return { api, outputListeners, exitListeners, unsubscribeOutput, unsubscribeExit };
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

describe("TerminalPanel", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  async function renderSessions(api: TerminalApi) {
    window.caval = { terminal: api } as Window["caval"];
    const result = mount(<TerminalSessions />);
    mounted = result;
    await act(async () => {
      await Promise.resolve();
    });
    return result;
  }

  it("renders the empty state and Open Terminal", async () => {
    const { api } = createTerminalMock();
    const { container } = await renderSessions(api);
    expect(container.textContent).toContain("No terminals open.");
    expect(container.querySelector('[data-testid="terminal-empty"]')).toBeTruthy();
    const open = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open Terminal"
    );
    expect(open).toBeTruthy();
  });

  it("calls window.caval.terminal.create when + is clicked", async () => {
    const { api } = createTerminalMock();
    const { container } = await renderSessions(api);
    const add = container.querySelector('[data-testid="terminal-tab-add"]');
    expect(add).toBeTruthy();
    await act(async () => {
      add?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.create).toHaveBeenCalledWith({ title: "Terminal 1" });
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
    expect(container.querySelector('[aria-label="Status: exited"]')).toBeTruthy();
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
