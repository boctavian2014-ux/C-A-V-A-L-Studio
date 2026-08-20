/**
 * Pas 7e.3 — per-workspace AI settings at `{workspace}/.cavalo/ai/settings.json`.
 * Not stored in history.db (config, not conversation data).
 */

import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_AI_SETTINGS,
  mergeAiSettings,
  normalizeAiSettings,
  type AiSettings,
} from "../../shared/ai-settings-contract";

export function aiSettingsPath(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot.trim()), ".cavalo", "ai", "settings.json");
}

export function loadAiSettingsSync(workspaceRoot: string): AiSettings {
  const root = workspaceRoot?.trim();
  if (!root) return { ...DEFAULT_AI_SETTINGS, toolsEnabled: { ...DEFAULT_AI_SETTINGS.toolsEnabled } };
  try {
    const raw = fs.readFileSync(aiSettingsPath(root), "utf8");
    return normalizeAiSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AI_SETTINGS, toolsEnabled: { ...DEFAULT_AI_SETTINGS.toolsEnabled } };
  }
}

export function saveAiSettingsSync(workspaceRoot: string, settings: AiSettings): void {
  const root = workspaceRoot.trim();
  if (!root) throw new Error("workspaceRoot is required");
  const filePath = aiSettingsPath(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = normalizeAiSettings(settings);
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function updateAiSettingsSync(
  workspaceRoot: string,
  partial: Partial<AiSettings>
): AiSettings {
  const current = loadAiSettingsSync(workspaceRoot);
  const merged = mergeAiSettings(current, partial);
  saveAiSettingsSync(workspaceRoot, merged);
  return merged;
}

export function resetAiSettingsSync(workspaceRoot: string): AiSettings {
  const defaults = normalizeAiSettings(DEFAULT_AI_SETTINGS);
  saveAiSettingsSync(workspaceRoot, defaults);
  return defaults;
}

export async function loadAiSettings(workspaceRoot: string): Promise<AiSettings> {
  return loadAiSettingsSync(workspaceRoot);
}

export async function saveAiSettings(
  workspaceRoot: string,
  settings: AiSettings
): Promise<void> {
  saveAiSettingsSync(workspaceRoot, settings);
}

export async function updateAiSettings(
  workspaceRoot: string,
  partial: Partial<AiSettings>
): Promise<AiSettings> {
  return updateAiSettingsSync(workspaceRoot, partial);
}

export async function resetAiSettings(workspaceRoot: string): Promise<AiSettings> {
  return resetAiSettingsSync(workspaceRoot);
}
