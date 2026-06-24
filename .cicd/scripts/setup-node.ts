import { run } from "./ci-utils";

const main = async (): Promise<void> => {
  await run("corepack", ["enable"]);
  await run("corepack", ["prepare", "pnpm@latest", "--activate"]);
  await run("pnpm", ["config", "set", "store-dir", ".pnpm-store"]);
};

void main();
