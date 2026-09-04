export type ExitWaitable = {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  once(event: "exit", listener: () => void): void;
  removeListener(event: "exit", listener: () => void): void;
};

export type KillableChild = ExitWaitable & {
  kill(signal?: NodeJS.Signals): boolean;
};

/** SIGTERM (or Windows terminate), wait, then kill again if still alive. */
export async function stopChildProcessAndWait(
  child: KillableChild,
  timeoutMs: number
): Promise<"exit" | "killed"> {
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  const result = await waitForChildExit(child, timeoutMs);
  if (result === "exit") return "exit";
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  return "killed";
}

export async function waitForChildExit(
  child: ExitWaitable,
  timeoutMs: number
): Promise<"exit" | "timeout"> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return "exit";
  }
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve("exit");
    };
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve("timeout");
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
