import fs from "node:fs/promises";
import path from "node:path";

import { stripJsonc } from "../../ai/config/caval-config-shared";
import type { CavalPreviewConfig } from "../shared/preview-types";

export { stripJsonc };

export type CavalPreviewFileConfig = CavalPreviewConfig;

interface CavalPreviewFileSlice {
  preview?: CavalPreviewConfig;
}

/** Read preview config only from the active workspace — never from app/cwd fallbacks. */
export async function loadCavalConfigFromWorkspaceFile(
  workspaceRoot: string
): Promise<CavalPreviewConfig | undefined> {
  const configPath = path.join(workspaceRoot, "caval.jsonc");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(stripJsonc(raw)) as CavalPreviewFileSlice;
    return parsed.preview;
  } catch {
    return undefined;
  }
}
