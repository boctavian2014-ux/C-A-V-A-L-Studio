import { run } from "./ci-utils";

/** PR-blocking quality gates — same order for GitHub Actions, cicd:test, and release:preflight. */
export const PR_QUALITY_GATES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "verify-runtime-assets"]],
];

/** Release-only: Electron boot without provider keys or live CAD/cloud. */
export const RELEASE_ONLY_GATES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["npm", ["run", "smoke:electron"]],
];

export async function runQualityGates(
  gates: ReadonlyArray<readonly [string, readonly string[]]> = PR_QUALITY_GATES
): Promise<void> {
  const diagnostics: string[] = [];
  for (const [command, args] of gates) {
    try {
      await run(command, [...args]);
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.join("\n"));
  }
}
