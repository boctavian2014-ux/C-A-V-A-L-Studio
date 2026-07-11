import fs from 'node:fs';
import path from 'node:path';

export type UserSimBehaviorProfile = 'normal' | 'fast' | 'slow' | 'chaotic';

export interface UserSimulatorConfig {
  enabled: boolean;
  profiles: UserSimBehaviorProfile[];
  maxPages: number;
  maxActionsPerPage: number;
  devServerTimeoutMs: number;
  retestWaves: number;
  baseUrl?: string | null;
  startCommand?: string | null;
  playwright: {
    headless: boolean;
    timeout: number;
  };
  browserMcp: {
    enabled: boolean;
    serverId: string;
  };
}

export const DEFAULT_USER_SIMULATOR_CONFIG: UserSimulatorConfig = {
  enabled: true,
  profiles: ['normal', 'fast', 'slow', 'chaotic'],
  maxPages: 40,
  maxActionsPerPage: 25,
  devServerTimeoutMs: 90_000,
  retestWaves: 2,
  baseUrl: null,
  startCommand: null,
  playwright: { headless: true, timeout: 15_000 },
  browserMcp: { enabled: true, serverId: 'cursor-ide-browser' },
};

function stripJsoncComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function loadUserSimulatorConfig(workspaceRoot?: string): UserSimulatorConfig {
  const roots = [workspaceRoot, process.cwd()].filter(Boolean) as string[];
  for (const root of roots) {
    const configPath = path.join(root, 'caval.jsonc');
    try {
      if (!fs.existsSync(configPath)) continue;
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(stripJsoncComments(raw)) as {
        userSimulator?: Partial<UserSimulatorConfig> & {
          playwright?: Partial<UserSimulatorConfig['playwright']>;
          browserMcp?: Partial<UserSimulatorConfig['browserMcp']>;
        };
      };
      if (parsed.userSimulator) {
        const cfg = parsed.userSimulator;
        return {
          ...DEFAULT_USER_SIMULATOR_CONFIG,
          ...cfg,
          playwright: { ...DEFAULT_USER_SIMULATOR_CONFIG.playwright, ...cfg.playwright },
          browserMcp: { ...DEFAULT_USER_SIMULATOR_CONFIG.browserMcp, ...cfg.browserMcp },
        };
      }
    } catch {
      // fall through
    }
  }
  return { ...DEFAULT_USER_SIMULATOR_CONFIG };
}

export interface ArenaUserSimOverrides {
  profiles?: UserSimBehaviorProfile[];
  maxPages?: number;
  maxActionsPerPage?: number;
  skipDevServer?: boolean;
  skipMcp?: boolean;
}

export function applyArenaUserSimOverrides(
  config: UserSimulatorConfig,
  overrides?: ArenaUserSimOverrides
): UserSimulatorConfig {
  if (!overrides) return config;
  return {
    ...config,
    profiles: overrides.profiles ?? config.profiles,
    maxPages: overrides.maxPages ?? config.maxPages,
    maxActionsPerPage: overrides.maxActionsPerPage ?? config.maxActionsPerPage,
    browserMcp: overrides.skipMcp
      ? { ...config.browserMcp, enabled: false }
      : config.browserMcp,
  };
}
