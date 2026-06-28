/** Hash draft for prepare cache matching (renderer-safe). */
export function hashChatDraft(
  text: string,
  model: string,
  projectPath: string | null
): string {
  const raw = `${text.trim()}|${model}|${projectPath ?? ''}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return `d${(h >>> 0).toString(36)}`;
}

export interface ChatPrepareSignals {
  workspaceRoot: string;
  objectiveDraft: string;
  model: string;
  activeFile?: string;
  openFiles?: string[];
  draftHash: string;
}

export interface ChatPrepareResult {
  ok: boolean;
  draftHash: string;
  warmContextReady: boolean;
  resolvedModelHint?: string;
  partialPlanPreview?: string;
  tokenId?: string;
  error?: string;
}
