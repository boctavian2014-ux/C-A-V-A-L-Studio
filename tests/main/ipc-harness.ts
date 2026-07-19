import { vi } from "vitest";

export type IpcHandler = (
  event: { sender: MockWebContents; senderFrame?: MockWebFrame | null },
  ...args: unknown[]
) => unknown;

export interface MockWebFrame {
  parent: null;
  url: string;
}

export interface MockWebContents {
  id: number;
  send: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
  getURL: () => string;
  mainFrame: MockWebFrame;
}

export function createIpcHarness() {
  const handlers = new Map<string, IpcHandler>();
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const mainFrame: MockWebFrame = { parent: null, url: "file:///caval-renderer/index.html" };

  const sender: MockWebContents = {
    id: 42,
    send: vi.fn(),
    isDestroyed: () => false,
    getURL: () => "file:///caval-renderer/index.html",
    mainFrame,
  };

  const ipcMain = {
    handle: (channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(listener);
      listeners.set(channel, set);
    },
  };

  return {
    ipcMain,
    handlers,
    listeners,
    sender,
    async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No IPC handler registered for ${channel}`);
      return (await handler({ sender, senderFrame: sender.mainFrame }, ...args)) as T;
    },
    emit(channel: string, ...args: unknown[]) {
      for (const listener of listeners.get(channel) ?? []) {
        listener({ sender, senderFrame: sender.mainFrame }, ...args);
      }
    },
    reset() {
      handlers.clear();
      listeners.clear();
      sender.send.mockClear();
    },
  };
}
