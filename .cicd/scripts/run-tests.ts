import { performance } from "node:perf_hooks";
import { run, writeMetrics } from "./ci-utils";
import { PR_QUALITY_GATES } from "./quality-gates";

const main = async (): Promise<void> => {
  const startedAt = performance.now();
  const diagnostics: string[] = [];

  for (const [command, args] of PR_QUALITY_GATES) {
    try {
      await run(command, [...args]);
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

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
