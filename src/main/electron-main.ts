import { app, BrowserWindow, dialog, ipcMain, Menu, shell, safeStorage } from "electron";
import { applyNativeWindowChrome, browserWindowChromeOptions, hideNativeMenuBar } from "./window-chrome";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AIComposer } from "../../ai/composer/composer";
import { AIClient } from "../../ai/ai-client";
import { getModelProfile } from "../../ai/model-profiles";
import { ContextEngineApi } from "../../context-engine/api";
import { codeReviewActions } from "../../ai/review/code-review-actions";
import { codeReviewStore } from "../../ai/review/code-review-store";
import type { ComposerResult } from "../../ai/composer/types";
import { mobileBuildRunner } from "../../mobile/mobile-build-runner";
import type { MobileBuildErrorAnalysis, MobilePlatform } from "../../mobile/types";
import { logicFlowAgent } from "../../components/ui/logicflow/logicflow-agent";
import type { LogicFlowExplainRequest, LogicFlowExplainResponse } from "../../components/ui/logicflow/types";
import { logicFlowPipelineEmitter, pipelineEventBus } from "../../components/ui/logicflow/logicflow-pipeline-emitter";
import { DebugAgent } from "../../ai/agents/debug";
import { agentOrchestrator } from "../../ai/agent/agent-orchestrator";
import type { AgentExecuteStepRequest, AgentAuditReport, Goal } from "../../ai/agent/types";
import { toolSandbox } from "../../ai/pipeline/tool-sandbox";
import type { PipelineEvent } from "../../components/ui/logicflow/types";
import { assertShellCommandAllowed } from "./shell-security";
import { ensureLatestPowerShellInstalled } from "./powershell-shell";
import { registerGitHandlers } from "./git-handlers";
import { registerProblemsHandlers } from "./problems-handlers";
import { registerTasksHandlers } from "./tasks-handlers";
import { registerTerminalHandlers } from "./terminal-handlers";
import { registerPreviewHandlers } from "./preview/preview-handlers";
import { installAppShutdownLifecycle } from "./app-shutdown";
import { closeAllAiPersistence } from "./ai/timeline-persistence";
import {
  armNvidiaMidstreamQuitGate,
  isNvidiaMidstreamQuitGate,
} from "./nvidia-midstream-quit-gate";
import {
  armWorkspaceOllamaQuitGate,
  isWorkspaceOllamaQuitGate,
} from "./workspace-ollama-quit-gate";
import { shutdownMark } from "./shutdown-diagnostics";
import {
  addRecentWorkspace,
  listRecentWorkspaces,
  removeRecentWorkspace,
  type RecentWorkspaceSource,
} from "./recent-workspaces";
import { createProjectOnDesktop } from "./desktop-project";
import { listFolderFiles } from "./workspace-folder-files";
import { registerEngineeringHandlers } from "./engineering-handlers";
import { registerModelHandlers, abortAllStreamsForSender } from "./model-handlers";
import { registerMcpHandlers } from "./mcp-handlers";
import { registerConnectionHealthHandlers } from "./connection-health-handlers";
import { registerChatApplyHandlers } from "./ai/chat-apply-handlers";
import { registerAiHistoryHandlers } from "./ai/ai-history-handlers";
import { registerAiSettingsHandlers } from "./ai/ai-settings-handlers";
import { registerWorkspaceIndexHandlers } from "./workspace/workspace-index-handlers";
import { registerWorkspaceSearchHandlers } from "./workspace/workspace-search-handlers";
import { workspaceIndexService } from "./workspace/workspace-index-service";
import { registerPreloadHandlers, preloadManager } from "./preload-handlers";
import { registerZLHandlers, zeroLatencyFusion } from "./zl-handlers";
import { registerDevRuntimeHandlers } from "./dev-runtime-ipc";
import { registerCadHandlers } from "./cad-handlers";
import {
  applyCadConnectionSave,
  applyCadConnectionToEnv,
  buildRendererSettingsMap,
  initCadConnectionBootEnv,
  type CadSettingsSaveInput,
} from "./cad-connection-settings";
import {
  CAD_API_URL_CLEAR_ACTION,
  CAD_URL_SETTING_KEY,
} from "../shared/cad-connection-settings-contract";
import { registerRoboticsLibraryHandlers } from "./robotics-library-handlers";
import { ensureCadLocalServer } from "./cad-local-server";
import {
  applyLocaleToSettings,
  resolveLocalePreference,
} from "./locale-settings";
import {
  buildRendererContextMenu,
  installApplicationMenu as installLocalizedApplicationMenu,
  listApplicationMenuTopLevel,
  popupApplicationSubmenu,
} from "./app-menu";
import { LOCALE_SETTING_KEY } from "../shared/i18n-contract";
import { startMarketplaceServer } from "./marketplace-server";
import { setMcpSecretsProvider } from "../../ai/tools/tool-runtime";
import { applyCadCloudEnvDefaults, isCadCloudOnly } from "./cad-config";

initCadConnectionBootEnv();
import { registerSchematicHandlers } from "./schematic-handlers";
import { preloadCoreModels, preloadForContext } from "../../ai/models/model-preload";
import { warmOpenRouterConnection } from "../../ai/models/openrouter-warm";
import { mergeSecrets, normalizeSecretsMap, filterNonEmptySecretsPatch } from "../../ai/models/api-secrets";
import {
  buildSecretProviderMetadata,
  configuredMapFromProviders,
  SETTINGS_FORBIDDEN_SECRET_KEYS,
} from "../shared/secrets-metadata";
import { inferPreloadContext } from "../../ai/models/infer-context";
import "./ipc-handlers";
import { registerSearchHandlers } from "./search-handlers";
import { registerDebugHandlers } from "./debug-handlers";
import { registerLspHandlers } from "./lsp-handlers";
import { registerExtensionHandlers } from "./extension-handlers";
import { registerMarketplaceHandlers } from "./marketplace-handlers";
import { setCavalConfigExtraPaths } from "../../ai/config/caval-config";
import { setIpcWorkspaceRoot } from "./ipc-handlers";
import { assertTrustedSender } from "./ipc-trust";
import {
  CAVALLO_TRUSTED_HOSTS,
  openExternalUrl,
  redactUrlForDisplay,
  STRIPE_CHECKOUT_HOSTS,
} from "./external-url-policy";
import { validateSecretsPatchFormats, validateSecretFormat } from "./byok-key-format";
import { assertOllamaBaseUrl, assertProviderRequestUrl } from "./cloud-provider-registry";
import { consumeAiRateLimit } from "./ai-rate-limit";
import {
  assertTextContentSize,
  normalizeWorkspaceRoot,
  resolveSandboxedWorkspacePath,
} from "./path-security";
import { peekBoundWorkspaceRoot, requireBoundWorkspaceRoot } from "./bound-workspace";
import { NO_BOUND_WORKSPACE_ERROR } from "../shared/workspace-isolation";
import { workspaceCommandMutex } from "../../ai/tools/workspace-execute-lock";
import { runAllowedWorkspaceCommand } from "../../ai/tools/workspace-command-runner";
import {
  getRendererWebPreferences,
  installRendererSessionPolicy,
  installWebContentsSecurity,
} from "./renderer-security";
import { registerWorkspaceBindingHandlers } from "./workspace-binding-handlers";
import { registerWorkspaceDiscoveryHandlers } from "./workspace-discovery-handlers";
import {
  ensureLocalAiRuntime,
  ensureOllamaOnBoot,
  getLocalAiStatus,
  installOllamaRuntimeOnly,
  pullModelWithProgress,
  cancelActiveModelPull,
  LOCAL_AI_PULL_PROGRESS_CHANNEL,
} from "./local-ai-setup";
import {
  AI_PREFERRED_PROVIDER_SETTING,
  buildAiProvidersSnapshot,
  resolvePreferredProviderId,
} from "./ai/provider-registry";
import { getOllamaLoopbackUrl, OLLAMA_CHAT_URL } from "../shared/local-ai-contract";
import { isAllowedCustomUrl } from "../shared/ai-provider-contract";
import { AGENTIC_AVAILABILITY_CHANNEL } from "../shared/agentic-availability";
import {
  readAgenticCloudAvailability,
  toDeniedAgenticAvailability,
} from "./agentic-availability";
import { probeCustomProviderConnection } from "../../ai/providers/custom-openai-compatible";
import { probeNvidiaNimConnection } from "../../ai/providers/nvidia";

// Raise renderer/main V8 heap before Chromium boots (mitigates OOM on large bundles).
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=4096");
applyNativeWindowChrome();

/** Q1-F: headless boot check — no .env keys, no CAD cloud, no live providers. */
function isElectronSmokeMode(): boolean {
  return process.env.CAVAL_SMOKE === "1";
}

function skipInteractiveWindowChrome(): boolean {
  return (
    isElectronSmokeMode() || isNvidiaMidstreamQuitGate() || isWorkspaceOllamaQuitGate()
  );
}

const loadLocalEnvFile = (): void => {
  if (isElectronSmokeMode()) return;
  const envPath = path.join(process.cwd(), ".env");
  try {
    if (!fsSync.existsSync(envPath)) return;
    const content = fsSync.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional local overrides
  }
};

loadLocalEnvFile();

const workspaceRoots = new Map<number, string>();
const composer = new AIComposer();
const debugAgent = new DebugAgent();
const aiClient = new AIClient();
const contextEngine = new ContextEngineApi();

const workspaceFor = (senderId: number): string =>
  requireBoundWorkspaceRoot(getBoundWorkspaceRoot, senderId, NO_BOUND_WORKSPACE_ERROR);

function bindWorkspace(senderId: number, folderPath: string): void {
  const normalized = normalizeWorkspaceRoot(folderPath);
  workspaceRoots.set(senderId, normalized);
  setIpcWorkspaceRoot(senderId, normalized);
}

export function getBoundWorkspaceRoot(senderId: number): string | undefined {
  return workspaceRoots.get(senderId);
}

registerGitHandlers(getBoundWorkspaceRoot);
registerProblemsHandlers(getBoundWorkspaceRoot);
registerTasksHandlers(getBoundWorkspaceRoot);
registerTerminalHandlers(getBoundWorkspaceRoot);
registerPreviewHandlers(getBoundWorkspaceRoot);
registerEngineeringHandlers(getBoundWorkspaceRoot);
registerModelHandlers(getBoundWorkspaceRoot);
registerChatApplyHandlers(getBoundWorkspaceRoot);
registerAiHistoryHandlers(getBoundWorkspaceRoot);
registerAiSettingsHandlers(getBoundWorkspaceRoot);
registerWorkspaceIndexHandlers(getBoundWorkspaceRoot);
registerWorkspaceSearchHandlers(getBoundWorkspaceRoot);
registerMcpHandlers(getBoundWorkspaceRoot);
registerConnectionHealthHandlers(getBoundWorkspaceRoot);
registerPreloadHandlers(workspaceFor);
registerZLHandlers(workspaceFor);
registerDevRuntimeHandlers();
registerCadHandlers(getBoundWorkspaceRoot);
registerRoboticsLibraryHandlers(getBoundWorkspaceRoot);
registerSchematicHandlers(workspaceFor);
registerSearchHandlers(workspaceFor);
registerDebugHandlers(getBoundWorkspaceRoot);
registerLspHandlers(getBoundWorkspaceRoot);
registerExtensionHandlers(getBoundWorkspaceRoot);
registerMarketplaceHandlers();

const subscribePipelineIpc = (sender: Electron.WebContents): (() => void) => {
  return pipelineEventBus.on((event: PipelineEvent) => {
    sender.send("caval:pipeline-event", event);
  });
};

interface CavalChatRequest {
  message: string;
  model: string;
  mode: "ask" | "plan";
  context?: {
    filePath?: string;
    fileContent?: string;
  };
}

interface CavalChatResponse {
  ok: boolean;
  provider: "cloud" | "ollama" | "none";
  content: string;
  error?: string;
}

const installRendererContextMenu = (window: BrowserWindow): void => {
  window.webContents.on("context-menu", (_event, params) => {
    const template = buildRendererContextMenu(resolveUiLocale(), params);
    if (template.length === 0) return;
    Menu.buildFromTemplate(template).popup({ window });
  });
};

const createWindow = (): BrowserWindow => {
  const iconPath = path.join(__dirname, "../../build-icons/icon.png");
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 650,
    resizable: true,
    maximizable: true,
    title: "CAVAL",
    ...(fsSync.existsSync(iconPath) ? { icon: iconPath } : {}),
    ...browserWindowChromeOptions(),
    webPreferences: getRendererWebPreferences(path.join(__dirname, "preload.js")),
  });

  if (!skipInteractiveWindowChrome()) {
    window.maximize();
  }

  window.webContents.on("console-message", (_event, level, message, _line, sourceId) => {
    const tag = level >= 3 ? "error" : level === 2 ? "warn" : "log";
    console[tag === "log" ? "log" : tag](`[renderer${sourceId ? ` ${sourceId}` : ""}] ${message}`);
  });

  const loadRenderer = () => {
    window.loadFile(path.join(__dirname, "../renderer/index.html"));
  };

  let rendererRecoveryPending = false;
  let lastRendererGoneReason: string | undefined;

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      "[caval] Renderer process gone:",
      details.reason,
      "exitCode=",
      details.exitCode
    );
    lastRendererGoneReason = details.reason;
    abortAllStreamsForSender(window.webContents.id);
    rendererRecoveryPending = true;
    if (!window.isDestroyed()) {
      loadRenderer();
    }
  });

  window.webContents.on("unresponsive", () => {
    console.warn("[caval] Renderer unresponsive");
  });

  window.webContents.on("responsive", () => {
    console.info("[caval] Renderer responsive again");
  });

  window.webContents.on("did-finish-load", () => {
    console.info("[caval] Renderer loaded");
    if (isElectronSmokeMode()) {
      console.info("[caval-smoke] renderer-ready");
      const smokeWorkspace = process.env.CAVAL_SMOKE_WORKSPACE?.trim();
      if (smokeWorkspace && fsSync.existsSync(smokeWorkspace)) {
        bindWorkspace(window.webContents.id, smokeWorkspace);
        console.info("[caval-smoke] workspace-bound");
      }
      void window.webContents
        .executeJavaScript(
          `(() => {
            const bridge = window.caval;
            const hasFn = typeof bridge?.getDevRuntimeBuildStatus === "function";
            return { hasBridge: Boolean(bridge), hasFn };
          })()`
        )
        .then(async (probe: { hasBridge?: boolean; hasFn?: boolean }) => {
          if (!probe?.hasBridge || !probe?.hasFn) {
            console.error("[caval-smoke] fatal: window.caval.getDevRuntimeBuildStatus missing");
            return;
          }
          try {
            const status = await window.webContents.executeJavaScript(
              `window.caval.getDevRuntimeBuildStatus()`
            );
            if (!status || typeof status !== "object") {
              console.error("[caval-smoke] fatal: getDevRuntimeBuildStatus returned invalid status");
              return;
            }
            console.info("[caval-smoke] bridge-ready");
          } catch (error) {
            console.error(
              "[caval-smoke] fatal: getDevRuntimeBuildStatus failed:",
              error instanceof Error ? error.message : String(error)
            );
          }
        })
        .catch((error) => {
          console.error(
            "[caval-smoke] fatal: bridge probe failed:",
            error instanceof Error ? error.message : String(error)
          );
        })
        .finally(() => {
          console.info("[caval-smoke] complete");
          setTimeout(() => {
            closeAllAiPersistence();
            if (!window.isDestroyed()) window.close();
            app.quit();
          }, 250);
        });
      return;
    }
    if (isNvidiaMidstreamQuitGate()) {
      armNvidiaMidstreamQuitGate(window, app, bindWorkspace);
    }
    if (isWorkspaceOllamaQuitGate()) {
      armWorkspaceOllamaQuitGate(window, app, bindWorkspace);
    }
    if (rendererRecoveryPending && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      rendererRecoveryPending = false;
      window.webContents.send("caval:renderer-recovered", {
        reason: lastRendererGoneReason ?? "unknown",
        recoveredAt: new Date().toISOString(),
      });
      lastRendererGoneReason = undefined;
    }
  });

  if (!app.isPackaged && !skipInteractiveWindowChrome()) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error("[caval] Renderer failed to load:", code, description, url);
    if (isElectronSmokeMode()) {
      console.error("[caval-smoke] fatal: renderer failed to load");
      app.exit(1);
    }
  });

  installRendererContextMenu(window);
  hideNativeMenuBar(window);

  if (!app.isPackaged && !skipInteractiveWindowChrome()) {
    void window.webContents.session.clearCache().then(loadRenderer);
  } else {
    loadRenderer();
  }

  return window;
};

const languageFromPath = (filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".css": "css",
    ".html": "html",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java"
  };
  return languageMap[extension] ?? "text";
};

const focusedWindow = (): BrowserWindow | null => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;

const openFile = async (): Promise<void> => {
  const window = focusedWindow();
  if (!window) return;
  const result = await dialog.showOpenDialog(window, {
    title: "Open File or Project",
    properties: ["openFile", "openDirectory"],
    filters: [
      { name: "Code and Text", extensions: ["ts", "tsx", "js", "jsx", "json", "md", "css", "html", "py", "go", "rs", "java", "txt"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  const selectedPath = result.filePaths[0];
  if (result.canceled || !selectedPath) return;

  const stat = await fs.stat(selectedPath);
  const projectPath = stat.isDirectory() ? selectedPath : path.dirname(selectedPath);
  const projectFiles = await listFolderFiles(projectPath, 120, stat.isFile() ? selectedPath : undefined);

  window.webContents.send("caval:folder-opened", {
    path: projectPath,
    files: projectFiles
  });
  bindWorkspace(window.webContents.id, projectPath);
  void contextEngine.indexWorkspace(projectPath).catch(() => undefined);
  void workspaceIndexService.openWorkspace(projectPath).catch(() => undefined);
  void preloadManager.onWorkspaceOpen(projectPath, projectFiles.map((f) => f.path));
  preloadForContext(inferPreloadContext(projectPath, projectFiles.map((f) => f.path)));
};

const openFolder = async (): Promise<void> => {
  const window = focusedWindow();
  if (!window) return;
  const result = await dialog.showOpenDialog(window, {
    title: "Open Folder",
    properties: ["openDirectory"]
  });
  const folderPath = result.filePaths[0];
  if (result.canceled || !folderPath) return;
  window.webContents.send("caval:folder-opened", {
    path: folderPath,
    files: await listFolderFiles(folderPath)
  });
  bindWorkspace(window.webContents.id, folderPath);
  addRecentWorkspace(folderPath, "folder");
  void contextEngine.indexWorkspace(folderPath).catch(() => undefined);
  void workspaceIndexService.openWorkspace(folderPath).catch(() => undefined);
  void preloadManager.onWorkspaceOpen(folderPath);
  preloadForContext(inferPreloadContext(folderPath));
};

const sendMenuCommand = (command: string): void => {
  focusedWindow()?.webContents.send("caval:menu-command", command);
};

const sendWorkspaceToRenderer = async (
  webContentsId: number,
  sender: Electron.WebContents,
  folderPath: string,
  source: RecentWorkspaceSource = "folder"
): Promise<void> => {
  sender.send("caval:workspace-session-reset");
  bindWorkspace(webContentsId, folderPath);
  addRecentWorkspace(folderPath, source);
  const files = await listFolderFiles(folderPath, 240);
  sender.send("caval:folder-opened", {
    path: folderPath,
    files,
  });
  void contextEngine.indexWorkspace(folderPath).catch(() => undefined);
  void workspaceIndexService.openWorkspace(folderPath).catch(() => undefined);
  void preloadManager.onWorkspaceOpen(folderPath, files.map((f) => f.path));
  preloadForContext(inferPreloadContext(folderPath, files.map((f) => f.path)));
};

/** Renderer reload / re-open of the already-bound folder: hydrate files without wiping chat. */
const resyncWorkspaceToRenderer = async (
  webContentsId: number,
  sender: Electron.WebContents,
  folderPath: string,
  source: RecentWorkspaceSource = "folder"
): Promise<void> => {
  bindWorkspace(webContentsId, folderPath);
  addRecentWorkspace(folderPath, source);
  const files = await listFolderFiles(folderPath, 240);
  sender.send("caval:folder-opened", {
    path: folderPath,
    files,
  });
};

const appMenuHandlers = {
  sendMenuCommand,
  createWindow,
  openFile,
  openFolder,
  focusedWindow,
  quit: () => app.quit(),
  openDocs: () => {
    void openExternalUrl("https://caval.studio", {
      origin: "INTERNAL_CONSTANT",
      allowedHosts: CAVALLO_TRUSTED_HOSTS,
    });
  },
};

const installApplicationMenu = (): void => {
  installLocalizedApplicationMenu(resolveUiLocale(), appMenuHandlers);
  for (const window of BrowserWindow.getAllWindows()) {
    hideNativeMenuBar(window);
  }
};

function asFiniteCoord(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(-4000, Math.min(8000, value));
}

ipcMain.handle("caval:app-menu-top-level", (event) => {
  assertTrustedSender(event);
  return listApplicationMenuTopLevel();
});

ipcMain.handle(
  "caval:app-menu-popup",
  (event, request: { index?: unknown; x?: unknown; y?: unknown }) => {
    assertTrustedSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    const index = request?.index;
    const x = asFiniteCoord(request?.x);
    const y = asFiniteCoord(request?.y);
    if (
      !window ||
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 32 ||
      x === null ||
      y === null
    ) {
      return { ok: false as const };
    }
    return { ok: popupApplicationSubmenu(window, index, x, y) };
  },
);

ipcMain.handle("caval:save-file", async (event, request: { path?: string; content: string; saveAs?: boolean }) => {
  assertTrustedSender(event);
  const window = BrowserWindow.fromWebContents(event.sender);
  let targetPath = request.path;
  // Lot A: bound workspace only — never process.cwd() / renderer-supplied root fallback.
  const workspaceRoot = getBoundWorkspaceRoot(event.sender.id);

  try {
    assertTextContentSize(request.content ?? "", "save-file content");
  } catch (error) {
    return {
      canceled: true,
      error: error instanceof Error ? error.message : "Content too large",
    };
  }

  if (targetPath && !request.saveAs) {
    if (!workspaceRoot?.trim()) {
      return { canceled: true, error: "No workspace open" };
    }
    try {
      targetPath = resolveSandboxedWorkspacePath(workspaceRoot, targetPath);
    } catch (error) {
      return {
        canceled: true,
        error: error instanceof Error ? error.message : "Path outside workspace",
      };
    }
  }

  // Save As / untitled: ONLY via native dialog — renderer never sends free external path.
  if (!targetPath || request.saveAs) {
    const saveOptions = {
      title: "Save File",
      defaultPath: targetPath ? path.basename(targetPath) : "untitled.txt"
    };
    const result = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    targetPath = result.filePath;
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, request.content, "utf8");
  return {
    canceled: false,
    path: targetPath,
    label: path.basename(targetPath),
    language: languageFromPath(targetPath)
  };
});

ipcMain.on("caval:renderer-ready", (event) => {
  const folderPath = peekBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  if (!folderPath) {
    event.sender.send("caval:workspace-unbound", { workspaceRoot: null });
    return;
  }
  void sendWorkspaceToRenderer(event.sender.id, event.sender, folderPath);
});

const withTimeout = async <T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 45_000): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const systemPromptForMode = (mode: "ask" | "plan"): string =>
  mode === "plan"
    ? "Esti CAVAL Studio AI in modul Plan. Raspunde cu pasi clari, fisiere relevante, riscuri si validari. Nu modifica direct codul."
    : "Esti CAVAL Studio AI in modul Ask. Raspunde concis si practic, folosind contextul fisierului activ cand exista.";

const callCavalCloud = async (request: CavalChatRequest): Promise<CavalChatResponse> => {
  const endpoint = process.env.CAVAL_CLOUD_AI_URL;
  if (!endpoint) {
    throw new Error("CAVAL_CLOUD_AI_URL is not configured.");
  }
  const urlCheck = assertProviderRequestUrl("caval_cloud", endpoint);
  if (!urlCheck.ok) {
    throw new Error(urlCheck.error);
  }

  return withTimeout(async (signal) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.CAVAL_CLOUD_API_KEY ? { authorization: `Bearer ${process.env.CAVAL_CLOUD_API_KEY}` } : {})
      },
      signal,
      body: JSON.stringify({
        model: request.model,
        mode: request.mode,
        messages: [
          { role: "system", content: systemPromptForMode(request.mode) },
          {
            role: "user",
            content: [
              request.message,
              request.context?.filePath ? `\nActive file: ${request.context.filePath}` : "",
              request.context?.fileContent ? `\n\n${request.context.fileContent.slice(0, 16_000)}` : ""
            ].join("")
          }
        ],
        context: request.context
      })
    });

    if (!response.ok) {
      await response.text().catch(() => "");
      throw new Error(`Caval Cloud failed with ${response.status}`);
    }

    const json = await response.json() as { content?: string; message?: { content?: string }; choices?: Array<{ message?: { content?: string } }> };
    return {
      ok: true,
      provider: "cloud",
      content: json.content ?? json.message?.content ?? json.choices?.[0]?.message?.content ?? ""
    };
  });
};

const callOllama = async (request: CavalChatRequest): Promise<CavalChatResponse> => {
  const validated = assertOllamaBaseUrl(OLLAMA_CHAT_URL);
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  const endpoint = validated.normalized;

  return withTimeout(async (signal) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        model: request.model,
        stream: false,
        messages: [
          { role: "system", content: systemPromptForMode(request.mode) },
          {
            role: "user",
            content: [
              request.message,
              request.context?.filePath ? `\nActive file: ${request.context.filePath}` : "",
              request.context?.fileContent ? `\n\n${request.context.fileContent.slice(0, 16_000)}` : ""
            ].join("")
          }
        ],
        options: {
          temperature: request.mode === "plan" ? 0.2 : 0.4,
          num_predict: request.mode === "plan" ? 1600 : 900
        }
      })
    });

    if (!response.ok) {
      await response.text().catch(() => "");
      throw new Error(`Ollama failed with ${response.status}`);
    }

    const json = await response.json() as { message?: { content?: string } };
    return {
      ok: true,
      provider: "ollama",
      content: json.message?.content ?? ""
    };
  }, Number(process.env.CAVAL_OLLAMA_TIMEOUT_MS ?? 180_000));
};

ipcMain.handle("caval:ai-chat", async (event, request: CavalChatRequest): Promise<CavalChatResponse> => {
  assertTrustedSender(event);
  const errors: string[] = [];
  const profile = getModelProfile(request.model);

  if (profile) {
    try {
      const response = await aiClient.complete({
        prompt: request.message,
        system: systemPromptForMode(request.mode),
        capability: request.mode === "plan" ? "planning" : "chat",
        intent: request.mode === "plan" ? "planning" : undefined,
        messages: [
          { role: "system", content: systemPromptForMode(request.mode) },
          {
            role: "user",
            content: [
              request.message,
              request.context?.filePath ? `\nActive file: ${request.context.filePath}` : "",
              request.context?.fileContent ? `\n\n${request.context.fileContent.slice(0, 16_000)}` : ""
            ].join("")
          }
        ]
      });
      return {
        ok: true,
        provider: profile.provider === "open_source" ? "ollama" : "cloud",
        content: response.content
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const isLocalFreeModel = request.model.startsWith("qwen") || request.model.startsWith("llama");

  if (process.env.CAVAL_CLOUD_AI_URL) {
    try {
      return await callCavalCloud(request);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (isLocalFreeModel || !process.env.CAVAL_CLOUD_AI_URL) {
    try {
      return await callOllama(request);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    ok: false,
    provider: "none",
    content: [
      "Nu am putut contacta nici Caval Cloud, nici Ollama local.",
      "",
      "Ollama pare instalat? Daca vezi timeout la prima intrebare, modelul se incarca lent. Mai incearca o data sau seteaza CAVAL_OLLAMA_TIMEOUT_MS mai mare.",
      "",
      "Pentru local free models:",
      "1. Instaleaza Ollama",
      `2. Ruleaza: ollama pull ${request.model}`,
      "3. Porneste Ollama si incearca din nou.",
      "",
      "Pentru cloud:",
      "Seteaza CAVAL_CLOUD_AI_URL si optional CAVAL_CLOUD_API_KEY."
    ].join("\n"),
    error: errors.join("\n")
  };
});

ipcMain.handle("caval:composer-run", async (event, request: {
  objective: string;
  mode?: "ask" | "plan";
  skipSuggestions?: boolean;
  skipReview?: boolean;
  suggestionSessionId?: string;
  reviewSessionId?: string;
  approvedAlternativeId?: string;
  runBuild?: boolean;
  runTests?: boolean;
}): Promise<ComposerResult> => {
  assertTrustedSender(event);
  const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  zeroLatencyFusion.prepare({
    workspaceRoot,
    objectiveDraft: request.objective,
  });
  void preloadManager.onUserAction("composer.run", {
    workspaceRoot,
    pipelineNode: request.mode === "plan" ? "suggestions" : "composer",
  });
  const useSuggestions = request.mode === "plan" && !request.skipSuggestions;
  const sender = event.sender;
  const unsubscribeStep = logicFlowPipelineEmitter.subscribe((step) => {
    sender.send("caval:logicflow-pipeline-step", step);
  });
  const unsubscribeEvents = subscribePipelineIpc(sender);
  try {
    return await composer.run({
      objective: request.objective,
      workspaceRoot,
      skipSuggestions: !useSuggestions,
      skipReview: request.skipReview,
      suggestionSessionId: request.suggestionSessionId,
      reviewSessionId: request.reviewSessionId,
      approvedAlternativeId: request.approvedAlternativeId,
      dryRun: false,
      runBuild: request.runBuild ?? false,
      runTests: request.runTests ?? false
    });
  } finally {
    unsubscribeStep();
    unsubscribeEvents();
  }
});

ipcMain.handle("caval:suggestions-approve", (_event, input: { sessionId: string; alternativeId?: string }) => {
  return composer.approveSuggestions(input.sessionId, input.alternativeId);
});

ipcMain.handle("caval:suggestions-proceed", async (event, input: {
  sessionId: string;
  objective: string;
  alternativeId?: string;
}) => {
  assertTrustedSender(event);
  const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  const sender = event.sender;
  const unsubscribeStep = logicFlowPipelineEmitter.subscribe((step) => {
    sender.send("caval:logicflow-pipeline-step", step);
  });
  const unsubscribeEvents = subscribePipelineIpc(sender);
  try {
    return await composer.proceedAfterSuggestions(input.sessionId, {
      objective: input.objective,
      workspaceRoot,
      approvedAlternativeId: input.alternativeId
    }, input.alternativeId);
  } finally {
    unsubscribeStep();
    unsubscribeEvents();
  }
});

ipcMain.handle("caval:review-action", async (event, input: {
  action: "acceptAll" | "rejectAll" | "acceptFile" | "rejectFile" | "acceptHunk" | "rejectHunk" | "acceptLine" | "rejectLine" | "askAIToRevise";
  targetId?: string;
}) => {
  assertTrustedSender(event);
  switch (input.action) {
    case "acceptAll": return codeReviewActions.acceptAll();
    case "rejectAll": return codeReviewActions.rejectAll();
    case "acceptFile": if (input.targetId) codeReviewActions.acceptFile(input.targetId); break;
    case "rejectFile": if (input.targetId) codeReviewActions.rejectFile(input.targetId); break;
    case "acceptHunk": if (input.targetId) codeReviewActions.acceptHunk(input.targetId); break;
    case "rejectHunk": if (input.targetId) codeReviewActions.rejectHunk(input.targetId); break;
    case "acceptLine": if (input.targetId) codeReviewActions.acceptLine(input.targetId); break;
    case "rejectLine": if (input.targetId) codeReviewActions.rejectLine(input.targetId); break;
    case "askAIToRevise": {
      const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      const session = await codeReviewActions.askAIToRevise();
      if (session) {
        await composer.run({
          objective: `Revise the proposed patches based on code review session ${session.id}`,
          workspaceRoot,
          skipSuggestions: true,
          reviewSessionId: session.id,
          runBuild: false,
          runTests: false
        });
      }
      return codeReviewStore.current;
    }
  }
  return codeReviewStore.current;
});

ipcMain.handle("caval:review-apply", async (event, input: { sessionId: string; objective: string }) => {
  assertTrustedSender(event);
  const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  const sender = event.sender;
  const unsubscribeStep = logicFlowPipelineEmitter.subscribe((step) => {
    sender.send("caval:logicflow-pipeline-step", step);
  });
  const unsubscribeEvents = subscribePipelineIpc(sender);
  try {
    return await composer.applyAfterReview(input.sessionId, {
      objective: input.objective,
      workspaceRoot
    });
  } finally {
    unsubscribeStep();
    unsubscribeEvents();
  }
});

ipcMain.handle("caval:logicflow-explain-node", async (event, request: LogicFlowExplainRequest): Promise<LogicFlowExplainResponse> => {
  try {
    const workspaceRoot = workspaceFor(event.sender.id);
    return logicFlowAgent.explainNode({
      ...request,
      context: {
        ...request.context,
        workspaceRoot: request.context?.workspaceRoot ?? workspaceRoot
      }
    });
  } catch (error) {
    return {
      ok: false,
      content: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("caval:debug-suggest-fix", async (_event, input: {
  message: string;
  nodeId?: string;
  meta?: Record<string, unknown>;
}) => {
  const explanation = await debugAgent.diagnose([{
    source: "runtime",
    message: input.message
  }]);
  const fix = await debugAgent.suggestFix([{ source: "runtime", message: input.message }], []);
  const commands = fix
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("npx") || line.startsWith("npm"));
  return {
    explanation,
    commands: commands.length > 0 ? commands : ["npx expo doctor"],
    autoApply: false
  };
});

ipcMain.handle("caval:tool-replay", async (event, input: {
  toolCallId: string;
  tool: string;
  input?: unknown;
  confirm?: boolean;
}) => {
  assertTrustedSender(event);
  const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  return toolSandbox.run({
    toolCallId: input.toolCallId,
    tool: input.tool,
    input: input.input,
    confirm: input.confirm ?? false
  }, workspaceRoot);
});

ipcMain.handle("caval:agent-create-plan", async (event, goal: Goal) => {
  const sender = event.sender;
  const unsubscribeEvents = subscribePipelineIpc(sender);
  try {
    return await agentOrchestrator.createPlan(goal);
  } finally {
    unsubscribeEvents();
  }
});

ipcMain.handle("caval:agent-execute-step", async (event, request: AgentExecuteStepRequest) => {
  assertTrustedSender(event);
  const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  const sender = event.sender;
  const unsubscribeEvents = subscribePipelineIpc(sender);
  try {
    return await agentOrchestrator.executeStep(request, workspaceRoot);
  } finally {
    unsubscribeEvents();
  }
});

ipcMain.handle("caval:agent-abort", async () => {
  agentOrchestrator.abort();
  return { ok: true };
});

ipcMain.handle("caval:agent-save-audit", async (event, audit: AgentAuditReport) => {
  assertTrustedSender(event);
  try {
    // Lot A: bound root only — never process.cwd() fallback via workspaceFor.
    const workspaceRoot = getBoundWorkspaceRoot(event.sender.id);
    if (!workspaceRoot?.trim()) {
      return { ok: false, error: "No workspace open" };
    }
    const dir = resolveSandboxedWorkspacePath(workspaceRoot, path.join(workspaceRoot, ".caval", "agent-audits"));
    await fs.mkdir(dir, { recursive: true });
    const token = String(audit?.replayToken ?? "audit").replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 80);
    const filePath = resolveSandboxedWorkspacePath(dir, `${token}.json`);
    const payload = JSON.stringify(audit, null, 2);
    assertTextContentSize(payload, "agent audit");
    await fs.writeFile(filePath, payload, "utf8");
    return { ok: true, path: filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
});

ipcMain.handle("caval:sandbox-run", async (event, input: {
  toolCallId: string;
  tool: string;
  input?: unknown;
  confirm?: boolean;
}) => {
  assertTrustedSender(event);
  const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  const unsubscribeEvents = subscribePipelineIpc(event.sender);
  try {
    const toolId = input.toolCallId || `sandbox-${Date.now()}`;
    pipelineEventBus.emit({
      type: "tool.call",
      id: toolId,
      tool: input.tool,
      input: input.input,
      timestamp: Date.now(),
      meta: { source: "sandbox-panel" }
    });
    const result = await toolSandbox.run({
      toolCallId: toolId,
      tool: input.tool,
      input: input.input,
      confirm: input.confirm ?? true
    }, workspaceRoot);
    return result;
  } finally {
    unsubscribeEvents();
  }
});

ipcMain.handle("caval:apply-fix-rerun", async (event, input: { message: string; commands: string[] }) => {
  assertTrustedSender(event);
  const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  const command = input.commands?.[0];
  if (!command || typeof command !== "string") {
    return { ok: false, error: "No fix command provided." };
  }
  // Zone B: allowlist only — no free command string from renderer/LLM
  try {
    assertShellCommandAllowed(command);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const fixId = `fix-${Date.now()}`;
  pipelineEventBus.emit({
    type: "tool.call",
    id: fixId,
    tool: "npm.script",
    input: { command },
    timestamp: Date.now()
  });
  try {
    const result = await workspaceCommandMutex.runExclusive(workspaceRoot, () =>
      runAllowedWorkspaceCommand(command, workspaceRoot)
    );
    pipelineEventBus.emit({
      type: "tool.result",
      id: fixId,
      success: result.ok,
      output: result,
      timestamp: Date.now()
    });
    return { ok: result.ok, timedOut: result.timedOut, error: result.ok ? undefined : result.output };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("caval:mobile-build-start", async (event, input: { platform: MobilePlatform }) => {
  assertTrustedSender(event);
  if (mobileBuildRunner.isRunning()) {
    return { ok: false, error: "A mobile build is already running." };
  }

  const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  const sender = event.sender;

  void mobileBuildRunner.run(input.platform, workspaceRoot, {
    onData: (line) => sender.send("caval:mobile-build-data", line),
    onError: (analysis: MobileBuildErrorAnalysis) => sender.send("caval:mobile-build-error", analysis),
    onStep: (stepId, status) => sender.send("caval:mobile-build-step", { stepId, status }),
    onComplete: (ok) => sender.send("caval:mobile-build-complete", { ok })
  });

  return { ok: true, started: true };
});

ipcMain.handle("caval:mobile-build-cancel", (event) => {
  assertTrustedSender(event);
  mobileBuildRunner.cancel();
  return { ok: true };
});

ipcMain.handle("caval:mobile-build-fix", async (event, input: { command: string }) => {
  assertTrustedSender(event);
  const workspaceRoot = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
  const sender = event.sender;

  if (!input?.command || typeof input.command !== "string") {
    return { ok: false, error: "No fix command provided." };
  }
  // Zone B: allowlist only — reject free command strings outside policy
  try {
    assertShellCommandAllowed(input.command);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  try {
    const result = await workspaceCommandMutex.runExclusive(workspaceRoot, async () => {
      const run = await runAllowedWorkspaceCommand(input.command, workspaceRoot);
      sender.send("caval:mobile-build-data", `> ${input.command}`);
      if (run.output) sender.send("caval:mobile-build-data", run.output);
      sender.send("caval:mobile-build-complete", { ok: run.ok });
      return run;
    });
    return { ok: result.ok, timedOut: result.timedOut };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("caval:context-index", async (event) => {
  try {
    const root = workspaceFor(event.sender.id);
    const documents = await contextEngine.indexWorkspace(root);
    return { ok: true, documentCount: documents.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

registerWorkspaceBindingHandlers({
  bindWorkspace,
  getBoundRoot: (id) => workspaceRoots.get(id),
  addRecentWorkspace,
  onOpen: sendWorkspaceToRenderer,
  onCachedOpen: resyncWorkspaceToRenderer,
});
registerWorkspaceDiscoveryHandlers(getBoundWorkspaceRoot);

ipcMain.handle("workspace:list-recent", (event) => {
  assertTrustedSender(event);
  return { ok: true, entries: listRecentWorkspaces() };
});

ipcMain.handle("workspace:createOnDesktop", (event, input: { name?: string }) => {
  assertTrustedSender(event);
  const result = createProjectOnDesktop(
    typeof input?.name === "string" ? input.name : "Cavallo-Project"
  );
  if (result.ok && result.path) {
    void shell.openPath(result.path);
  }
  return result;
});

ipcMain.handle("workspace:remove-recent", (event, folderPath: string) => {
  assertTrustedSender(event);
  if (!folderPath || typeof folderPath !== "string") {
    return { ok: false, error: "Invalid folder path" };
  }
  return { ok: true, entries: removeRecentWorkspace(folderPath) };
});

/** Lightweight root sync is registered in registerWorkspaceBindingHandlers (SEC-IPC-WS-BINDING-001). */

ipcMain.handle("caval:context-search", async (event, input: { query: string; limit?: number }) => {
  try {
    const root = workspaceFor(event.sender.id);
    await contextEngine.restoreWorkspace(root);
    const results = await contextEngine.search(input.query, input.limit ?? 20);
    return { ok: true, results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[caval] context-search failed:", message);
    return { ok: false, results: [], error: message };
  }
});

const secretsFilePath = (): string => path.join(app.getPath("userData"), "caval-api-keys.bin");

const SECRET_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "POOLSIDE_API_KEY",
  "NORTH_API_KEY",
  "NVIDIA_API_KEY",
  "MESHY_API_KEY",
  "PIAPI_API_KEY",
  "TRELLIS_API_KEY",
  "CAD_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "FIRECRAWL_API_KEY",
  "POSTGRES_CONNECTION_STRING",
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "SEMGREP_APP_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BILLING_API_KEY",
  "CUSTOM_PROVIDER_BASE_URL",
  "CUSTOM_PROVIDER_API_KEY",
  "CUSTOM_PROVIDER_MODEL_ID",
  "CUSTOM_PROVIDER_LABEL",
] as const;

/** Never returned to the renderer as plaintext (main/env only). */
const RENDERER_REDACTED_SECRET_KEYS = new Set<string>([
  ...SECRET_ENV_KEYS,
  "SUPABASE_SERVICE_ROLE_KEY",
  "BILLING_API_KEY",
]);
void RENDERER_REDACTED_SECRET_KEYS;

const buildSecretsConfiguredMap = (
  stored: Record<string, string>
): Record<string, boolean> => {
  const providers = buildSecretProviderMetadata({ stored });
  return configuredMapFromProviders(providers);
};

const readApiSecrets = (): Record<string, string> => {
  try {
    if (!fsSync.existsSync(secretsFilePath())) return {};
    const raw = fsSync.readFileSync(secretsFilePath());
    if (safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(raw)) as Record<string, string>;
    }
    return JSON.parse(raw.toString("utf8")) as Record<string, string>;
  } catch {
    return {};
  }
};

const writeApiSecrets = (secrets: Record<string, string>): void => {
  const payload = JSON.stringify(secrets);
  if (safeStorage.isEncryptionAvailable()) {
    fsSync.writeFileSync(secretsFilePath(), safeStorage.encryptString(payload));
  } else {
    fsSync.writeFileSync(secretsFilePath(), payload, "utf8");
  }
};

const mergeApiSecrets = (patch: Record<string, string>): Record<string, string> =>
  normalizeSecretsMap(mergeSecrets(readApiSecrets(), patch));

const applyStoredSecretsToEnv = (): void => {
  const secrets = normalizeSecretsMap(readApiSecrets());
  for (const key of SECRET_ENV_KEYS) {
    const value = secrets[key]?.trim();
    if (value) process.env[key] = value;
    else delete process.env[key];
  }
};

const appSettings = new Map<number, Record<string, string>>();

const SETTINGS_KEYS_ON_DISK = new Set([
  "ollama.url",
  "cad.apiUrl",
  "caval.userId",
  "ai.preferredProvider",
  "ui.locale",
]);
const SETTINGS_SENSITIVE_KEYS = new Set([
  "openrouter.apiKey",
  "caval.cloud.apiKey",
  "cad.apiKey",
  "mesh.apiKey",
]);

const settingsFilePath = (): string =>
  path.join(app.getPath("userData"), "caval-app-settings.json");

let persistedAppSettings: Record<string, string> = {};

const readPersistedAppSettings = (): Record<string, string> => {
  try {
    if (!fsSync.existsSync(settingsFilePath())) return {};
    const raw = fsSync.readFileSync(settingsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const resolveUiLocale = (): string => {
  const settings = Object.keys(persistedAppSettings).length
    ? persistedAppSettings
    : readPersistedAppSettings();
  return resolveLocalePreference(settings, app.getLocale()).locale;
};

const writePersistedAppSettings = (settings: Record<string, string>): void => {
  const forDisk: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (SETTINGS_SENSITIVE_KEYS.has(key)) continue;
    if (!SETTINGS_KEYS_ON_DISK.has(key) && !key.startsWith("caval.")) continue;
    if (value?.trim()) forDisk[key] = value.trim();
  }
  fsSync.writeFileSync(settingsFilePath(), JSON.stringify(forDisk, null, 2), "utf8");
  persistedAppSettings = forDisk;
};

const applySettingsToEnv = (settings: Record<string, string>): void => {
  // Ollama is loopback-only — migrate/ignore legacy ollama.url overrides.
  if (settings["ollama.url"]?.trim()) {
    const canonical = getOllamaLoopbackUrl();
    if (settings["ollama.url"].trim() !== canonical) {
      settings["ollama.url"] = canonical;
    }
  }
  process.env.OLLAMA_BASE_URL = OLLAMA_CHAT_URL;
  applyCadConnectionToEnv(settings);
  // Meshy / OpenRouter / CAD keys live only in secrets → applyStoredSecretsToEnv.
  if (settings["caval.cloud.apiKey"]?.trim()) {
    process.env.CAVAL_CLOUD_API_KEY = settings["caval.cloud.apiKey"].trim();
  }
};

const loadPersistedAppSettings = (): void => {
  persistedAppSettings = readPersistedAppSettings();
  applySettingsToEnv(persistedAppSettings);
};

ipcMain.handle("caval:settings-save", async (event, settings: CadSettingsSaveInput) => {
  try {
    assertTrustedSender(event);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const incoming = { ...(settings ?? {}) };
  for (const key of Object.keys(incoming)) {
    if (
      key === CAD_URL_SETTING_KEY ||
      key === CAD_API_URL_CLEAR_ACTION
    ) {
      continue;
    }
    if (
      (SETTINGS_FORBIDDEN_SECRET_KEYS as readonly string[]).includes(key) ||
      /\.apiKey$/i.test(key) ||
      /api[_-]?key|token|secret|password/i.test(key)
    ) {
      return {
        ok: false,
        error:
          "API keys cannot be saved via settings-save. Use secrets-set (Settings → Chei API).",
      };
    }
  }
  const cadPatch: CadSettingsSaveInput = {};
  if (incoming[CAD_URL_SETTING_KEY] !== undefined) {
    cadPatch[CAD_URL_SETTING_KEY] = incoming[CAD_URL_SETTING_KEY];
  }
  if (incoming[CAD_API_URL_CLEAR_ACTION] !== undefined) {
    cadPatch[CAD_API_URL_CLEAR_ACTION] = incoming[CAD_API_URL_CLEAR_ACTION];
  }
  const cadSave = await applyCadConnectionSave({
    incoming: cadPatch,
    persisted: persistedAppSettings,
  });
  if (!cadSave.ok) {
    return { ok: false, error: cadSave.error };
  }
  delete incoming[CAD_URL_SETTING_KEY];
  delete incoming[CAD_API_URL_CLEAR_ACTION];
  if (incoming["ollama.url"] !== undefined) {
    incoming["ollama.url"] = getOllamaLoopbackUrl();
  }
  if (incoming[LOCALE_SETTING_KEY] !== undefined) {
    const localeResult = applyLocaleToSettings({}, incoming[LOCALE_SETTING_KEY]);
    if (!localeResult.ok) {
      return { ok: false, error: localeResult.error };
    }
    incoming[LOCALE_SETTING_KEY] = localeResult.locale;
  }
  const merged = { ...cadSave.merged, ...incoming };
  writePersistedAppSettings(merged);
  const secrets = normalizeSecretsMap(readApiSecrets());
  const configured = buildSecretsConfiguredMap(secrets);
  const extras: Record<string, string> = {
    "openrouter.configured": configured.OPENROUTER_API_KEY ? "true" : "false",
    "mesh.configured": configured.MESHY_API_KEY ? "true" : "false",
    "trellis.configured":
      configured.PIAPI_API_KEY || configured.TRELLIS_API_KEY ? "true" : "false",
    "cad.configured": configured.CAD_API_KEY ? "true" : "false",
  };
  const { settings: forRenderer, cadConnection } = buildRendererSettingsMap(merged, extras);
  appSettings.set(event.sender.id, forRenderer);
  applySettingsToEnv(merged);
  return { ok: true, cadConnection, settings: forRenderer };
});

ipcMain.handle("caval:settings-load", (event) => {
  persistedAppSettings = readPersistedAppSettings();
  const secrets = normalizeSecretsMap(readApiSecrets());
  const configured = buildSecretsConfiguredMap(secrets);
  const extras: Record<string, string> = {
    "openrouter.configured": configured.OPENROUTER_API_KEY ? "true" : "false",
    "mesh.configured": configured.MESHY_API_KEY ? "true" : "false",
    "trellis.configured":
      configured.PIAPI_API_KEY || configured.TRELLIS_API_KEY ? "true" : "false",
    "cad.configured": configured.CAD_API_KEY ? "true" : "false",
  };
  const { settings, cadConnection } = buildRendererSettingsMap(persistedAppSettings, extras);
  const withUser = getRendererSettings(event.sender.id, settings);
  appSettings.set(event.sender.id, withUser);
  return { ok: true, settings: withUser, cadConnection };
});

ipcMain.handle("caval:locale-get", (event) => {
  try {
    assertTrustedSender(event);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  persistedAppSettings = readPersistedAppSettings();
  const { locale, source } = resolveLocalePreference(
    persistedAppSettings,
    app.getLocale()
  );
  return { ok: true, locale, source };
});

ipcMain.handle("caval:locale-set", (event, localeInput: unknown) => {
  try {
    assertTrustedSender(event);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  persistedAppSettings = readPersistedAppSettings();
  const result = applyLocaleToSettings(persistedAppSettings, localeInput);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  writePersistedAppSettings(result.settings);
  persistedAppSettings = result.settings;
  const forRenderer = { ...result.settings };
  for (const key of SETTINGS_SENSITIVE_KEYS) {
    delete forRenderer[key];
  }
  appSettings.set(event.sender.id, forRenderer);
  installApplicationMenu();
  return { ok: true, locale: result.locale };
});

ipcMain.handle("caval:local-ai-status", async (event) => {
  try {
    assertTrustedSender(event);
    const status = await getLocalAiStatus();
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

/** Pas 7f.3 — install runtime only (confirmed: true required). */
ipcMain.handle("caval:local-ai-install", async (event, req: { confirmed?: boolean }) => {
  try {
    assertTrustedSender(event);
    if (req?.confirmed !== true) {
      return { success: false, error: "Install requires explicit confirmation" };
    }
    return await installOllamaRuntimeOnly({ confirmed: true });
  } catch {
    return {
      success: false,
      error: "Installation failed",
    };
  }
});

const activePullControllers = new Map<string, AbortController>();

/** Pas 7f.3 — pull model with progress events (confirmed: true required). */
ipcMain.handle(
  "caval:local-ai-pull-model",
  async (event, req: { modelId?: string; confirmed?: boolean }) => {
    try {
      assertTrustedSender(event);
      if (req?.confirmed !== true) {
        return { success: false, error: "Model download requires explicit confirmation" };
      }
      const modelId = typeof req.modelId === "string" ? req.modelId.trim() : "";
      if (!modelId) {
        return { success: false, error: "Model id is required" };
      }
      const controller = new AbortController();
      activePullControllers.set(modelId, controller);
      try {
        return await pullModelWithProgress(
          { modelId, confirmed: true },
          (progress) => {
            try {
              if (!event.sender.isDestroyed()) {
                event.sender.send(LOCAL_AI_PULL_PROGRESS_CHANNEL, progress);
              }
            } catch {
              /* sender gone */
            }
          },
          controller.signal
        );
      } finally {
        activePullControllers.delete(modelId);
      }
    } catch {
      return { success: false, error: "Model download failed" };
    }
  }
);

ipcMain.handle("caval:local-ai-pull-cancel", async (event, modelId: string) => {
  try {
    assertTrustedSender(event);
    const id = typeof modelId === "string" ? modelId.trim() : "";
    const controller = id ? activePullControllers.get(id) : undefined;
    controller?.abort();
    cancelActiveModelPull(id || undefined);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle(
  "caval:local-ai-setup",
  async (
    event,
    input?: { installRuntime?: boolean; pullModel?: boolean; modelName?: string }
  ) => {
    try {
      assertTrustedSender(event);
      // 7f.3: legacy channel no longer auto-pulls even if pullModel: true.
      return await ensureLocalAiRuntime({
        ...input,
        pullModel: false,
      });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
);

const billingBaseUrl = (): string =>
  process.env.BILLING_URL ?? `http://127.0.0.1:${process.env.BILLING_PORT ?? 8790}`;

const getRendererSettings = (
  senderId: number,
  base?: Record<string, string>
): Record<string, string> => {
  const settings = { ...(base ?? appSettings.get(senderId) ?? persistedAppSettings) };
  if (!settings["caval.userId"]) {
    settings["caval.userId"] = persistedAppSettings["caval.userId"] ?? `caval_${randomUUID()}`;
    persistedAppSettings = { ...persistedAppSettings, "caval.userId": settings["caval.userId"] };
    writePersistedAppSettings(persistedAppSettings);
  }
  return settings;
};

ipcMain.handle("caval:billing-user-id", (event) => {
  assertTrustedSender(event);
  const settings = getRendererSettings(event.sender.id);
  return { ok: true, userId: settings["caval.userId"] };
});

ipcMain.handle("caval:billing-entitlements", async (event) => {
  assertTrustedSender(event);
  const settings = getRendererSettings(event.sender.id);
  const userId = settings["caval.userId"];
  const apiKey = process.env.BILLING_API_KEY ?? process.env.BILLING_ADMIN_KEY;
  if (!apiKey) {
    return { ok: true, plan: "community", status: "unknown", entitlements: [] };
  }
  try {
    const res = await fetch(`${billingBaseUrl()}/api/billing/entitlements/${userId}`, {
      headers: { "x-billing-api-key": apiKey },
    });
    const json = (await res.json()) as {
      ok?: boolean;
      plan?: string;
      status?: string;
      entitlements?: string[];
      expiresAt?: string;
    };
    return { ok: true, ...json };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("caval:billing-checkout", async (event, input: { email: string }) => {
  assertTrustedSender(event);
  const settings = getRendererSettings(event.sender.id);
  const userId = settings["caval.userId"];
  const apiKey = process.env.BILLING_API_KEY ?? process.env.BILLING_ADMIN_KEY;
  if (!apiKey) {
    return { ok: false, error: "BILLING_API_KEY not configured on server" };
  }
  try {
    const res = await fetch(`${billingBaseUrl()}/api/billing/checkout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-billing-api-key": apiKey,
      },
      body: JSON.stringify({
        cavalId: userId,
        email: input.email,
        successUrl: `${billingBaseUrl()}/checkout/success`,
        cancelUrl: `${billingBaseUrl()}/checkout/cancel`,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
    if (!res.ok || !json.url) {
      return { ok: false, error: json.error ?? `Checkout failed (${res.status})` };
    }
    // USER_INITIATED_TRUSTED: user clicked Pay — Stripe allowlist only; redact URL in response.
    const opened = await openExternalUrl(json.url, {
      origin: "USER_INITIATED_TRUSTED",
      allowedHosts: STRIPE_CHECKOUT_HOSTS,
    });
    if (!opened.ok) {
      return { ok: false, error: opened.error ?? "Checkout URL blocked by security policy." };
    }
    return { ok: true, url: redactUrlForDisplay(json.url) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("caval:secrets-get", (event) => {
  try {
    assertTrustedSender(event);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const stored = normalizeSecretsMap(readApiSecrets());
  const providers = buildSecretProviderMetadata({ stored });
  return {
    ok: true,
    providers,
    configured: configuredMapFromProviders(providers),
  };
});

/** Pas 7f.1 — unified provider registry + status (no secret values). */
ipcMain.handle("caval:ai-providers-list", async (event) => {
  try {
    assertTrustedSender(event);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    const stored = normalizeSecretsMap(readApiSecrets());
    const configured = buildSecretsConfiguredMap(stored);
    const snapshot = await buildAiProvidersSnapshot({
      configured,
      preferredProviderId: persistedAppSettings[AI_PREFERRED_PROVIDER_SETTING],
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    });
    return { ok: true, ...snapshot };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle(AGENTIC_AVAILABILITY_CHANNEL, (event) => {
  try {
    assertTrustedSender(event);
  } catch (error) {
    return toDeniedAgenticAvailability(error);
  }
  return readAgenticCloudAvailability();
});

ipcMain.handle(
  "caval:ai-providers-set-preferred",
  async (event, input: { providerId?: string }) => {
    try {
      assertTrustedSender(event);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const preferred = resolvePreferredProviderId(input?.providerId);
    const merged = {
      ...persistedAppSettings,
      [AI_PREFERRED_PROVIDER_SETTING]: preferred,
    };
    writePersistedAppSettings(merged);
    return { ok: true, preferredProviderId: preferred };
  }
);

ipcMain.handle("caval:secrets-set", (event, secrets: Record<string, string>) => {
  assertTrustedSender(event);
  // Defense in depth: never apply empty / marker values that would wipe or corrupt keys.
  const { filtered } = filterNonEmptySecretsPatch(secrets ?? {});
  if (Object.keys(filtered).length === 0) {
    return { ok: true };
  }
  // Lot C5.5: format validation only — no automatic network dry-run.
  const format = validateSecretsPatchFormats(filtered);
  if (!format.ok) {
    return { ok: false, error: format.error, key: format.key };
  }
  const merged = mergeApiSecrets(filtered);
  writeApiSecrets(merged);
  applyStoredSecretsToEnv();
  return { ok: true };
});

/**
 * Lot C5.5 — Explicit user-initiated key test (never runs on save).
 * Returns only valid | invalid | unreachable — no bodies/keys.
 */
ipcMain.handle(
  "caval:test-provider-key",
  async (
    event,
    input: {
      providerId: string;
      secretKey?: string;
      draft?: { baseUrl?: string; apiKey?: string; modelId?: string };
    }
  ) => {
    assertTrustedSender(event);
    const limit = consumeAiRateLimit("complete", event.sender.id, "secrets-test");
    if (!limit.ok) {
      return { ok: false, result: "unreachable" as const, error: "rate_limited" };
    }

    if (input?.providerId === "nvidia") {
      const secrets = normalizeSecretsMap(readApiSecrets());
      const draftKey = input.draft?.apiKey?.trim();
      const storedKey = secrets.NVIDIA_API_KEY?.trim();
      const apiKey = draftKey || storedKey;
      if (!apiKey) {
        return { ok: false, result: "invalid" as const };
      }
      const format = validateSecretFormat("NVIDIA_API_KEY", apiKey);
      if (!format.ok) {
        return { ok: false, result: "invalid" as const };
      }
      const probe = await probeNvidiaNimConnection({ apiKey });
      if (!probe.ok) {
        return { ok: false, result: probe.result };
      }
      return { ok: true, result: "valid" as const };
    }

    if (input?.providerId === "custom") {
      const secrets = normalizeSecretsMap(readApiSecrets());
      const baseUrl = (input.draft?.baseUrl ?? secrets.CUSTOM_PROVIDER_BASE_URL ?? "").trim();
      const apiKey = (input.draft?.apiKey ?? secrets.CUSTOM_PROVIDER_API_KEY ?? "").trim();
      if (!baseUrl || !isAllowedCustomUrl(baseUrl)) {
        return {
          ok: false,
          result: "invalid" as const,
          error: "Custom endpoint must be localhost/loopback or https",
        };
      }
      const probe = await probeCustomProviderConnection({
        baseUrl,
        apiKey: apiKey || undefined,
      });
      if (!probe.ok) {
        return { ok: false, result: probe.result };
      }
      return { ok: true, result: "valid" as const };
    }

    const secrets = normalizeSecretsMap(readApiSecrets());
    const keyName = String(input?.secretKey ?? "").trim();
    const value = secrets[keyName]?.trim();
    if (!value) {
      return { ok: false, result: "invalid" as const };
    }
    const format = validateSecretFormat(keyName, value);
    if (!format.ok) {
      return { ok: false, result: "invalid" as const };
    }
    return { ok: true, result: "valid" as const };
  }
);

app.whenReady().then(() => {
  applyNativeWindowChrome();
  app.setName("CAVAL");
  installRendererSessionPolicy();
  installWebContentsSecurity();
  if (!isElectronSmokeMode()) {
    loadPersistedAppSettings();
  }
  installApplicationMenu();
  if (!isElectronSmokeMode()) {
    applyStoredSecretsToEnv();
    setCavalConfigExtraPaths([app.getAppPath()]);
    setMcpSecretsProvider(readApiSecrets);
    applyCadCloudEnvDefaults();
    warmOpenRouterConnection(true);
    preloadCoreModels();
    void ensureOllamaOnBoot();
    void ensureLatestPowerShellInstalled().catch((err) => {
      console.warn("[shell] PowerShell 7 ensure skipped:", err instanceof Error ? err.message : err);
    });
    void startMarketplaceServer().catch((err) => {
      console.warn("[marketplace] auto-start skipped:", err instanceof Error ? err.message : err);
    });
    if (!isCadCloudOnly()) {
      void ensureCadLocalServer().catch((err) => {
        console.warn("[cad] auto-start skipped:", err instanceof Error ? err.message : err);
      });
    } else {
      console.info("[cad] cloud-only mode — CAD API:", process.env.CAD_API_URL);
    }
  } else {
    console.info("[caval-smoke] main-ready");
    const preloadPath = path.join(__dirname, "preload.js");
    if (fsSync.existsSync(preloadPath)) {
      console.info("[caval-smoke] preload-present");
    } else {
      console.error("[caval-smoke] fatal: missing preload.js");
    }
  }
  createWindow();
  if (isElectronSmokeMode()) {
    console.info("[caval-smoke] window-created");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

installAppShutdownLifecycle(app);

app.on("window-all-closed", () => {
  shutdownMark("window-all-closed");
  if (process.platform !== "darwin") {
    app.quit();
  }
});
