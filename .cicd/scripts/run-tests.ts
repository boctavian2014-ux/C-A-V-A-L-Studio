import { performance } from "node:perf_hooks";
import { run, writeMetrics } from "./ci-utils";

const main = async (): Promise<void> => {
  const startedAt = performance.now();
  const diagnostics: string[] = [];

  const commands: Array<[string, string[]]> = [
    ["npm", ["run", "typecheck"]],
    ["npm", ["test"]],
    ["npm", ["run", "build"]]
  ];

  for (const command of commands) {
    try {
      await run(command[0], command[1]);
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  await writeMetrics([
    { name: "test.duration", value: elapsedMs, unit: "ms" },
    { name: "test.failures", value: diagnostics.length }
  ]);

  if (diagnostics.length > 0) {
    throw new Error(diagnostics.join("\n"));
  }
};

void main();
