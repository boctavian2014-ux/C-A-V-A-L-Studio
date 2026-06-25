import { modelProfiles } from "../../ai/model-profiles";

/** @deprecated Legacy vanilla workbench — use React WorkbenchRoot (workbench-app.tsx) instead. Not bundled in webpack. */

const root = document.getElementById("root");

type Panel = "explorer" | "search" | "source-control" | "run" | "extensions" | "problems" | "output" | "debug" | "terminal" | "marketplace" | "settings" | "ai-suggestions" | "code-review" | "logicflow" | "mobile-build";
type MobilePlatform = "android" | "ios" | "ota";
type MobileBuildStatus = "idle" | "running" | "success" | "error";
type MobileBuildStepStatus = "pending" | "running" | "done" | "error";

interface WorkspaceFile {
  path: string;
  label: string;
  language: string;
  content: string;
  dirty?: boolean;
}

interface FileTreeNode {
  name: string;
  path: string;
  children: Map<string, FileTreeNode>;
  file?: WorkspaceFile;
}

interface SuggestionsSession {
  id: string;
  request: string;
  summary: {
    headline: string;
    affectedFileCount: number;
    affectedSymbolCount: number;
    estimatedLines: { min: number; max: number };
    complexity: string;
  };
  symbolImpacts: Array<{ symbol: string; kind: string; file: string; action: string; description: string }>;
  risks: Array<{ id: string; level: string; title: string; description: string; mitigation?: string }>;
  alternatives: Array<{ id: string; title: string; summary: string; recommended?: boolean; estimatedFiles: number; estimatedLines: { min: number; max: number } }>;
  selectedAlternativeId?: string;
  sideEffects: string[];
}

interface ReviewSession {
  id: string;
  summary: string;
  status: string;
  files: Array<{
    id: string;
    path: string;
    decision: string;
    stats: { additions: number; deletions: number };
    semanticSummary?: string;
    hunks: Array<{
      id: string;
      header: string;
      decision: string;
      lines: Array<{ id: string; type: string; content: string; decision: string; oldLineNumber?: number; newLineNumber?: number }>;
    }>;
  }>;
}

interface CavalComposerResult {
  ok: boolean;
  phase: "completed" | "awaiting_suggestions" | "awaiting_review" | "failed";
  changedFiles: string[];
  rolledBack: boolean;
  diagnostics: Array<{ level: string; source: string; message: string }>;
  suggestions?: SuggestionsSession;
  review?: ReviewSession;
}

interface CavalMobileBuildError {
  matched: boolean;
  pattern?: string;
  explanation: string;
  suggestedCommands: string[];
  canAutoFix: boolean;
}

interface CavalApi {
  onMenuCommand: (callback: (command: string) => void) => () => void;
  onFileOpened: (callback: (file: WorkspaceFile) => void) => () => void;
  onFolderOpened: (callback: (folder: { path: string; files: WorkspaceFile[] }) => void) => () => void;
  ready: () => void;
  saveFile: (request: { path?: string; content: string; saveAs?: boolean }) => Promise<{ canceled: boolean; path?: string; label?: string; language?: string }>;
  chat: (request: {
    message: string;
    model: string;
    mode: "ask" | "plan";
    context?: {
      filePath?: string;
      fileContent?: string;
    };
  }) => Promise<{ ok: boolean; provider: "cloud" | "ollama" | "none"; content: string; error?: string }>;
  composerRun?: (request: {
    objective: string;
    mode?: "ask" | "plan";
    skipSuggestions?: boolean;
    skipReview?: boolean;
    suggestionSessionId?: string;
    reviewSessionId?: string;
    approvedAlternativeId?: string;
  }) => Promise<CavalComposerResult>;
  suggestionsApprove?: (input: { sessionId: string; alternativeId?: string }) => Promise<unknown>;
  suggestionsProceed?: (input: { sessionId: string; objective: string; alternativeId?: string }) => Promise<CavalComposerResult>;
  reviewAction?: (input: {
    action: "acceptAll" | "rejectAll" | "acceptFile" | "rejectFile" | "acceptHunk" | "rejectHunk" | "acceptLine" | "rejectLine" | "askAIToRevise";
    targetId?: string;
  }) => Promise<ReviewSession | null>;
  reviewApply?: (input: { sessionId: string; objective: string }) => Promise<CavalComposerResult>;
  logicflowExplainNode?: (request: {
    nodeId: "suggestions" | "composer" | "review" | "debug";
    label: string;
    description: string;
    context?: { composerPhase?: CavalComposerResult["phase"] };
  }) => Promise<{ ok: boolean; content: string; error?: string }>;
  onLogicFlowPipelineStep?: (callback: (step: {
    nodeId: "suggestions" | "composer" | "review" | "debug";
    edgeId?: string | null;
  }) => void) => () => void;
  onPipelineEvent?: (callback: (event: {
    type: string;
    timestamp: number;
    [key: string]: unknown;
  }) => void) => () => void;
  suggestDebugFix?: (input: { message: string; nodeId?: string; meta?: Record<string, unknown> }) => Promise<{
    explanation: string;
    commands: string[];
    autoApply: boolean;
  }>;
  replayTool?: (input: { toolCallId: string; tool: string; input?: unknown; confirm: boolean }) => Promise<{
    ok: boolean;
    output?: unknown;
    error?: string;
  }>;
  applyFixAndRerun?: (input: { message: string; commands: string[] }) => Promise<{ ok: boolean; error?: string }>;
  startMobileBuild?: (input: { platform: MobilePlatform }) => Promise<{ ok: boolean; started?: boolean; error?: string }>;
  cancelMobileBuild?: () => Promise<{ ok: boolean }>;
  fixMobileBuild?: (input: { command: string }) => Promise<{ ok: boolean }>;
  onMobileBuildData?: (callback: (line: string) => void) => () => void;
  onMobileBuildError?: (callback: (analysis: CavalMobileBuildError) => void) => () => void;
  onMobileBuildComplete?: (callback: (result: { ok: boolean }) => void) => () => void;
  onMobileBuildStep?: (callback: (step: { stepId: string; status: string }) => void) => () => void;
  contextIndex?: () => Promise<{ ok: boolean; documentCount?: number }>;
  contextSearch?: (input: { query: string; limit?: number }) => Promise<{ ok: boolean; results?: unknown[] }>;
  settingsSave?: (settings: Record<string, string>) => Promise<{ ok: boolean }>;
  settingsLoad?: () => Promise<{ ok: boolean; settings?: Record<string, string> }>;
  startTerminal: () => Promise<{ started: boolean; reused?: boolean }>;
  writeTerminal: (data: string) => Promise<{ ok: boolean; error?: string }>;
  stopTerminal: () => Promise<{ ok: boolean }>;
  onTerminalData: (callback: (data: string) => void) => () => void;
}

const caval = (window as unknown as { caval?: CavalApi }).caval;

interface CavalLogicFlowGlobal {
  mount: (targets: { sidebar: HTMLElement; canvas: HTMLElement; inspector: HTMLElement }) => void;
  unmount: () => void;
  syncPhase: (phase: CavalComposerResult["phase"] | "running") => void;
  syncPipelineStep: (nodeId: "suggestions" | "composer" | "review" | "debug", edgeId?: string | null) => void;
}

const logicFlowGlobal = (): CavalLogicFlowGlobal | undefined =>
  (window as unknown as { CavalLogicFlow?: CavalLogicFlowGlobal }).CavalLogicFlow;

const syncLogicFlowPhase = (phase: CavalComposerResult["phase"] | "running"): void => {
  logicFlowGlobal()?.syncPhase(phase);
};

const syncLogicFlowStep = (step: { nodeId: "suggestions" | "composer" | "review" | "debug"; edgeId?: string | null }): void => {
  logicFlowGlobal()?.syncPipelineStep(step.nodeId, step.edgeId);
};

let files: WorkspaceFile[] = [
  {
    path: "src/app.caval.ts",
    label: "app.caval.ts",
    language: "typescript",
    content: `import { createCavalStudio } from "./core";

const app = createCavalStudio({
  productName: "Caval Studio",
  ai: true,
  contextEngine: true,
  marketplace: true,
  romaniaLayer: true
});

app.start();
`
  },
  {
    path: "ai/composer/composer.ts",
    label: "composer.ts",
    language: "typescript",
    content: `export class AIComposer {
  async run(objective: string) {
    const context = await this.gatherContext(objective);
    const plan = await this.generatePlan(context);
    const patch = await this.generatePatch(plan);

    return this.applyAndValidate(patch);
  }
}
`
  },
  {
    path: "marketplace/extensions/manifest.json",
    label: "manifest.json",
    language: "json",
    content: `{
  "name": "romania-tools",
  "publisher": "caval",
  "version": "0.1.0",
  "engines": {
    "caval": "^0.1.0",
    "vscode": "^1.90.0"
  }
}
`
  },
  {
    path: "romania/anaf-api.ts",
    label: "anaf-api.ts",
    language: "typescript",
    content: `export class AnafApiClient {
  async checkCompany(cui: string) {
    return {
      cui,
      active: true,
      checkedAt: new Date().toISOString()
    };
  }
}
`
  }
];

const marketplaceItems = [
  "Romania Tools",
  "Caval Dark Theme",
  "AI Composer Pack",
  "eFactura Helper"
];

let activePanel: Panel = "explorer";
let activeFile = files[0];
let openedFiles = [files[0]];
let workspaceName = "caval studio";
let selectedModel = "qwen2.5-coder:7b";
let enabledModelIds = ["qwen2.5-coder:7b", "llama3.1:8b"];
let composerMode: "ask" | "plan" = "ask";
let terminalOpen = false;
let terminalOutput = "Terminal not started. Use Terminal > New Terminal.\r\n";
let settingsOpen = false;
let activeSettingsCategory = "Models";
const settingsState: Record<string, string> = {
  "editor.fontSize": "13",
  "editor.wordWrap": "off",
  "files.autoSave": "off",
  "caval.ai.defaultModel": selectedModel,
  "caval.ai.mode": composerMode,
  "caval.ai.localFallback": "true",
  "workbench.colorTheme": "Caval Graphite",
  "workbench.sideBar.location": "left",
  "workbench.activityBar.visible": "true",
  "terminal.integrated.defaultProfile.windows": "PowerShell",
  "terminal.integrated.fontSize": "12",
  "marketplace.extensions.autoUpdate": "true",
  "marketplace.extensions.verify": "false",
  "caval.cloud.apiKey": "",
  "openrouter.apiKey": "",
  "ollama.url": "http://localhost:11434/api/chat"
};
let chatMessages = [
  { role: "assistant", text: "Salut. Sunt Composer-ul Caval. Spune-mi ce vrei sa modific in proiect." }
];
let suggestionsSession: SuggestionsSession | null = null;
let reviewSession: ReviewSession | null = null;
let lastComposerObjective = "";
let selectedReviewFileId = "";
let mobilePlatform: MobilePlatform = "android";
let mobileBuildStatus: MobileBuildStatus = "idle";
let mobileBuildLogs: string[] = [];
let mobileBuildSteps: Array<{ id: string; label: string; status: MobileBuildStepStatus }> = [
  { id: "env", label: "Check environment", status: "pending" },
  { id: "login", label: "Login to Expo", status: "pending" },
  { id: "prepare", label: "Prepare project", status: "pending" },
  { id: "build", label: "Build", status: "pending" },
  { id: "upload", label: "Upload", status: "pending" },
  { id: "publish", label: "Publish", status: "pending" }
];
let mobileLastError = "";
let mobileAiExplanation = "";
let mobileSuggestedCommands: string[] = [];
let mobileCanAutoFix = false;
let mobileBuildUrl = "";
let mobileTutorialOpen = false;
let extensionsImportStatus = "";
let searchQuery = "";

const models = modelProfiles.map((profile) => ({
  id: profile.id,
  label: profile.displayName,
  free: profile.costEstimate === "local",
  route: profile.provider === "open_source" ? "Local" : "Cloud"
}));

const settingsSections = [
  {
    title: "Commonly Used",
    items: [
      { key: "editor.fontSize", label: "Editor: Font Size", description: "Controls the font size in pixels.", control: "number", value: "13" },
      { key: "editor.wordWrap", label: "Editor: Word Wrap", description: "Controls how lines should wrap.", control: "select", value: "off", options: ["off", "on", "wordWrapColumn"] },
      { key: "files.autoSave", label: "Files: Auto Save", description: "Controls auto save for dirty editors.", control: "select", value: "off", options: ["off", "afterDelay", "onFocusChange"] }
    ]
  },
  {
    title: "AI",
    items: [
      { key: "caval.ai.defaultModel", label: "Caval AI: Default Model", description: "Model used for new Composer conversations.", control: "select", value: selectedModel, options: models.map((model) => model.id) },
      { key: "caval.ai.mode", label: "Caval AI: Default Mode", description: "Choose Ask for quick answers or Plan for structured changes.", control: "select", value: composerMode, options: ["ask", "plan"] },
      { key: "caval.ai.localFallback", label: "Caval AI: Local Fallback", description: "Use Ollama local models when cloud is unavailable.", control: "toggle", value: "true" }
    ]
  },
  {
    title: "Workbench",
    items: [
      { key: "workbench.colorTheme", label: "Workbench: Color Theme", description: "Preferred Caval Studio theme.", control: "select", value: "Caval Graphite", options: ["Caval Graphite", "Caval Ivory"] },
      { key: "workbench.sideBar.location", label: "Workbench: Side Bar Location", description: "Controls the location of the primary side bar.", control: "select", value: "left", options: ["left", "right"] },
      { key: "workbench.activityBar.visible", label: "Workbench: Activity Bar Visible", description: "Shows or hides the activity bar.", control: "toggle", value: "true" }
    ]
  },
  {
    title: "Terminal",
    items: [
      { key: "terminal.integrated.defaultProfile.windows", label: "Terminal: Default Profile Windows", description: "Default shell used by the integrated terminal.", control: "select", value: "PowerShell", options: ["PowerShell", "Command Prompt", "Git Bash"] },
      { key: "terminal.integrated.fontSize", label: "Terminal: Font Size", description: "Controls the terminal font size.", control: "number", value: "12" }
    ]
  },
  {
    title: "Marketplace",
    items: [
      { key: "marketplace.extensions.autoUpdate", label: "Marketplace: Auto Update Extensions", description: "Automatically update installed extensions.", control: "toggle", value: "true" },
      { key: "marketplace.extensions.verify", label: "Marketplace: Verified Extensions Only", description: "Prefer extensions verified by Caval.", control: "toggle", value: "false" }
    ]
  }
];

if (root) {
  const render = () => {
    root.innerHTML = `
      <main class="ide-shell ${settingsState["workbench.colorTheme"] === "Caval Ivory" ? "theme-light" : ""}">
        <aside class="activity-bar">
          <div class="caval-logo"><span></span><span></span><span></span></div>
          ${renderExtensionStrip()}
        </aside>

        <aside class="side-panel">
          ${renderSidePanel()}
        </aside>

        <section class="editor-area ${terminalOpen ? "has-terminal" : ""} ${activePanel === "logicflow" ? "logicflow-mode" : ""}">
          <header class="titlebar">
            <div class="titlebar-left">
              <button class="command-button" data-command="palette">Caval Studio</button>
              <span class="titlebar-path">${activePanel === "logicflow" ? "AI Pipeline" : settingsOpen ? "Caval Settings" : activeFile.path}</span>
            </div>
            <div class="titlebar-right">
              <button class="command-button" data-command="composer">Ask Composer</button>
              <nav class="titlebar-toolbar" aria-label="Panel shortcuts">
                ${titlebarButton("mobile-build", "Build Mobile App", "📱")}
                ${titlebarButton("ai-suggestions", "AI Suggestions", "💡")}
                ${titlebarButton("code-review", "Code Review", "CR")}
                ${titlebarButton("logicflow", "AI Pipeline", "⬡")}
                ${titlebarButton("source-control", "Source Control", "G")}
                ${titlebarButton("run", "Run", "R")}
                ${titlebarButton("extensions", "Extensions", "M")}
                ${titlebarButton("settings", "Settings", "⚙")}
              </nav>
            </div>
          </header>
          ${activePanel === "logicflow" ? `
            <div id="logicflow-canvas-root" class="logicflow-editor-host"></div>
          ` : `
          <nav class="tabs">
            ${settingsOpen ? `<button class="active" data-close-settings="false">Caval Settings</button>` : openedFiles.map((file) => `
                <button class="${file.path === activeFile.path ? "active" : ""}" data-file="${file.path}">
                  ${file.label}
                </button>
              `).join("")}
          </nav>
          ${settingsOpen ? renderSettingsEditor() : `
            <section class="editor">
              <div class="breadcrumbs">${activeFile.path.replaceAll("/", " / ")}</div>
            <textarea class="code-editor ${settingsState["editor.wordWrap"] === "on" ? "word-wrap" : ""}" style="font-size:${settingsState["editor.fontSize"]}px" spellcheck="false" data-editor>${escapeHtml(activeFile.content)}</textarea>
            </section>
          `}
          `}
          ${terminalOpen ? `
            <section class="terminal-panel">
              <header>
                <strong>Terminal</strong>
                <div>
                  <button data-terminal-action="new">New</button>
                  <button data-terminal-action="stop">Kill</button>
                  <button data-terminal-action="close">Close</button>
                </div>
              </header>
              <pre class="terminal-output">${escapeHtml(terminalOutput)}</pre>
              <form class="terminal-input">
                <span>&gt;</span>
                <input placeholder="Type a command and press Enter" autocomplete="off" />
              </form>
            </section>
          ` : ""}
        </section>

        <aside class="ai-panel">
          ${activePanel === "logicflow" ? `
            <div id="logicflow-inspector-root" class="logicflow-host"></div>
          ` : `
          <header>
            <div>
              <strong>Composer</strong>
              <span>Model Router: Nex / Laguna / Qwen</span>
            </div>
          </header>
          <div class="chat-log">
            ${chatMessages.map((message) => `
              <div class="chat-message chat-message--${message.role}">
                ${escapeHtml(message.text)}
              </div>
            `).join("")}
          </div>
          <form class="chat-input">
            <div class="composer-box">
              <textarea placeholder="Ask AI to edit, explain or debug..." rows="3"></textarea>
              <div class="composer-controls">
                <div class="mode-toggle" role="tablist" aria-label="Composer mode">
                  <button type="button" class="${composerMode === "ask" ? "active" : ""}" data-mode="ask">Ask</button>
                  <button type="button" class="${composerMode === "plan" ? "active" : ""}" data-mode="plan">Plan</button>
                </div>
                <select aria-label="AI model" data-model>
                  ${models.filter((model) => enabledModelIds.includes(model.id)).map((model) => `
                    <option value="${model.id}" ${model.id === selectedModel ? "selected" : ""}>
                      ${model.label}${model.free ? " · free" : ""} · ${model.route}
                    </option>
                  `).join("")}
                </select>
                <button type="submit">Send</button>
              </div>
            </div>
          </form>
          `}
        </aside>

        <footer class="global-statusbar">
          <span>Caval Studio</span>
          <span>${activeFile.path}${activeFile.dirty ? " • unsaved" : ""}</span>
          <span>${activeFile.language}</span>
          <span>Mode: ${composerMode.toUpperCase()}</span>
          <span>Model: ${models.find((model) => model.id === selectedModel)?.label ?? selectedModel}</span>
          <span>Theme: ${settingsState["workbench.colorTheme"]}</span>
          <span>Context: indexed</span>
          <span>AI: ready</span>
        </footer>

        <div class="palette" hidden>
          <div class="palette-box">
            <input placeholder="Type a command... e.g. marketplace, context, composer" autofocus />
            <button data-palette-action="search">Search in Workspace</button>
            <button data-palette-action="composer">Start Composer</button>
            <button data-palette-action="marketplace">Open Marketplace</button>
            <button data-palette-action="context">Index Context</button>
          </div>
        </div>
        ${mobileTutorialOpen ? renderMobileTutorialOverlay() : ""}
      </main>
    `;

    wireEvents();
  };

  const titlebarButton = (panel: Panel, label: string, icon: string) => `
    <button class="${activePanel === panel ? "active" : ""}" data-panel="${panel}" title="${label}">
      ${icon}
    </button>
  `;

  const renderExtensionStrip = () => {
    const promoLabels = ["Get", "Try", "Get"] as const;
    return `
      <div class="extension-strip">
        ${marketplaceItems.slice(0, 3).map((item, index) => `
          <button class="extension-promo-card" data-extension-promo="${escapeHtml(item)}" title="${escapeHtml(item)}">
            <strong>${promoLabels[index] ?? "Get"}</strong>
            <small>${escapeHtml(item)}</small>
          </button>
        `).join("")}
      </div>
    `;
  };

  const renderSuggestionsPanel = () => {
    if (!suggestionsSession) {
      return `
        <header><strong>AI Suggestions</strong><span>before review</span></header>
        <div class="ai-panel-empty">Trimite o cerere in modul <strong>Plan</strong> pentru a vedea sugestii inainte de patch-uri.</div>
      `;
    }

    const selectedAlt = suggestionsSession.selectedAlternativeId ?? suggestionsSession.alternatives.find((a) => a.recommended)?.id ?? "alt-optimized";
    return `
      <header><strong>AI Suggestions</strong><span>pulse tech</span></header>
      <div class="suggestions-panel">
        <div class="suggestions-hero">
          <div class="pulse-icon"></div>
          <p class="suggestions-headline">${escapeHtml(suggestionsSession.summary.headline)}</p>
          <small>${suggestionsSession.summary.affectedFileCount} files · ${suggestionsSession.summary.affectedSymbolCount} symbols · ${suggestionsSession.summary.estimatedLines.min}–${suggestionsSession.summary.estimatedLines.max} lines · ${suggestionsSession.summary.complexity}</small>
        </div>
        <details open>
          <summary>Symbol Impact</summary>
          ${suggestionsSession.symbolImpacts.slice(0, 12).map((impact) => `
            <div class="suggestions-symbol">
              <code>${escapeHtml(impact.symbol)}</code>
              <span class="tag">${escapeHtml(impact.action)}</span>
              <small>${escapeHtml(impact.file)}</small>
            </div>
          `).join("")}
        </details>
        <details open>
          <summary>Risks</summary>
          ${suggestionsSession.risks.map((risk) => `
            <div class="suggestions-risk risk-${risk.level}">
              <strong>${escapeHtml(risk.title)}</strong>
              <p>${escapeHtml(risk.description)}</p>
            </div>
          `).join("")}
        </details>
        <details open>
          <summary>Alternatives</summary>
          ${suggestionsSession.alternatives.map((alt) => `
            <button class="suggestions-alt ${selectedAlt === alt.id ? "active" : ""}" data-suggestion-alt="${alt.id}">
              <strong>${escapeHtml(alt.title)}</strong>
              <span>${alt.estimatedFiles} files · ${alt.estimatedLines.min}–${alt.estimatedLines.max} lines</span>
              <p>${escapeHtml(alt.summary)}</p>
            </button>
          `).join("")}
        </details>
        <div class="suggestions-actions">
          <button data-suggestion-action="reject">Reject</button>
          <button data-suggestion-action="approve">Approve Direction</button>
          <button class="primary" data-suggestion-action="proceed">Proceed to Patch Generation</button>
        </div>
      </div>
    `;
  };

  const renderCodeReviewPanel = () => {
    if (!reviewSession) {
      return `
        <header><strong>Code Review</strong><span>patch preview</span></header>
        <div class="ai-panel-empty">Patch-urile generate de Composer apar aici pentru review inainte de apply.</div>
      `;
    }

    const activeFile = reviewSession.files.find((file) => file.id === selectedReviewFileId) ?? reviewSession.files[0];
    if (activeFile && !selectedReviewFileId) selectedReviewFileId = activeFile.id;

    return `
      <header><strong>Code Review</strong><span>${reviewSession.status}</span></header>
      <div class="review-panel">
        <p class="review-summary">${escapeHtml(reviewSession.summary)}</p>
        <div class="review-actions">
          <button data-review-action="rejectAll">Reject All</button>
          <button data-review-action="askAIToRevise">Ask AI to Revise</button>
          <button data-review-action="acceptAll">Accept All</button>
          <button class="primary" data-review-action="apply">Apply Selected</button>
        </div>
        <div class="review-layout">
          <div class="review-files">
            ${reviewSession.files.map((file) => `
              <button class="review-file ${file.id === activeFile?.id ? "active" : ""} ${file.decision}" data-review-file="${file.id}">
                <strong>${escapeHtml(file.path)}</strong>
                <span><span class="add">+${file.stats.additions}</span> <span class="del">−${file.stats.deletions}</span></span>
                <div class="review-file-actions">
                  <span data-review-action="acceptFile" data-target-id="${file.id}">✓</span>
                  <span data-review-action="rejectFile" data-target-id="${file.id}">✕</span>
                </div>
              </button>
            `).join("")}
          </div>
          <div class="review-diff">
            ${activeFile ? activeFile.hunks.map((hunk) => `
              <section class="review-hunk ${hunk.decision}">
                <header>
                  <code>${escapeHtml(hunk.header)}</code>
                  <div>
                    <button data-review-action="acceptHunk" data-target-id="${hunk.id}">Accept hunk</button>
                    <button data-review-action="rejectHunk" data-target-id="${hunk.id}">Reject hunk</button>
                  </div>
                </header>
                ${hunk.lines.map((line) => `
                  <div class="review-line line-${line.type} ${line.decision}">
                    <span class="gutter">${line.oldLineNumber ?? ""}${line.newLineNumber ? `/${line.newLineNumber}` : ""}</span>
                    <code>${escapeHtml(line.content || " ")}</code>
                    <span class="line-actions">
                      <button data-review-action="acceptLine" data-target-id="${line.id}">✓</button>
                      <button data-review-action="rejectLine" data-target-id="${line.id}">✕</button>
                    </span>
                  </div>
                `).join("")}
              </section>
            `).join("") : "<p>Select a file to review.</p>"}
          </div>
        </div>
      </div>
    `;
  };

  const renderMobileTutorialOverlay = () => `
    <div class="cs-mobile-tutorial-overlay">
      <div class="cs-mobile-tutorial">
        <header>
          <h3>How to publish your mobile app with Expo</h3>
          <button data-mobile-tutorial-close="true">Close</button>
        </header>
        <div class="cs-tutorial-video-placeholder pt-pulse">
          <div class="pulse-icon"></div>
          <p>Tutorial video coming soon</p>
          <small>Caval Studio — Build. Ship. Publish.</small>
        </div>
        <ol class="cs-tutorial-steps">
          <li><strong>01. Create an Expo account</strong><div>Go to expo.dev and sign up.</div></li>
          <li><strong>02. Login from terminal</strong><code>npx expo login</code></li>
          <li><strong>03. Check project health</strong><code>npx expo doctor</code></li>
          <li><strong>04. Build Android (EAS)</strong><code>npx eas build --platform android</code></li>
          <li><strong>05. Build iOS (EAS)</strong><code>npx eas build --platform ios</code></li>
          <li><strong>06. Upload to stores</strong><div>Google Play Console / App Store Connect</div></li>
          <li><strong>07. OTA updates</strong><code>npx eas update --auto</code></li>
        </ol>
        <div class="cs-tutorial-note">Caval Studio AI Agent explains build errors and can suggest fixes automatically.</div>
      </div>
    </div>
  `;

  const renderMobileBuildPanel = () => {
    const statusText = {
      idle: "Ready to start build.",
      running: "Build in progress...",
      success: "Build completed successfully.",
      error: "Build failed. Check AI explanation."
    }[mobileBuildStatus];

    return `
      <header><strong>Build Mobile App</strong><span>Expo EAS</span></header>
      <div class="cs-mobile-panel">
        <div class="cs-mobile-header">
          <div>
            <h2>Build Mobile App</h2>
            <p>Android and iOS using Expo EAS.</p>
          </div>
          <button class="cs-btn-secondary" data-mobile-tutorial-open="true">Watch tutorial</button>
        </div>
        <div class="cs-mobile-layout">
          <div class="cs-mobile-left">
            <div class="cs-mobile-platform">
              <h3>Platform</h3>
              <div class="cs-platform-grid">
                ${(["android", "ios", "ota"] as MobilePlatform[]).map((platform) => `
                  <button type="button" class="cs-platform-card ${mobilePlatform === platform ? "cs-platform-card-active" : ""}" data-mobile-platform="${platform}">
                    <span class="cs-platform-title">${platform === "android" ? "Android" : platform === "ios" ? "iOS" : "OTA Update"}</span>
                    <span class="cs-platform-sub">${platform === "android" ? "APK / AAB via EAS" : platform === "ios" ? "IPA via Expo + Apple" : "EAS update over-the-air"}</span>
                  </button>
                `).join("")}
              </div>
            </div>
            <div class="cs-mobile-steps">
              <h3>Build steps</h3>
              <ul>
                ${mobileBuildSteps.map((step) => `
                  <li class="cs-step cs-step-${step.status}">
                    <span class="cs-step-label">${step.label}</span>
                    <span class="cs-step-status">${step.status}</span>
                  </li>
                `).join("")}
              </ul>
            </div>
            <div class="cs-mobile-actions">
              ${mobileBuildStatus === "idle" ? `<button class="cs-btn-primary pt-pulse" data-mobile-action="start">Start build</button>` : ""}
              ${mobileBuildStatus === "running" ? `<button class="cs-btn-secondary" data-mobile-action="cancel">Cancel build</button>` : ""}
              ${mobileBuildStatus === "error" ? `
                <button class="cs-btn-primary" data-mobile-action="rerun">Re-run build</button>
                <button class="cs-btn-ghost" data-mobile-action="fix-ai">Fix with AI</button>
                ${mobileCanAutoFix && mobileSuggestedCommands[0] ? `<button class="cs-btn-secondary" data-mobile-action="auto-fix" data-fix-command="${escapeHtml(mobileSuggestedCommands[0])}">Run fix</button>` : ""}
              ` : ""}
              ${mobileBuildStatus === "success" ? `<button class="cs-btn-secondary" data-mobile-action="rerun">Build again</button>` : ""}
            </div>
            ${mobileAiExplanation ? `
              <div class="cs-mobile-ai-explanation">
                <h4>AI explanation</h4>
                <p>${escapeHtml(mobileAiExplanation)}</p>
                ${mobileSuggestedCommands.map((cmd) => `<code>${escapeHtml(cmd)}</code>`).join("")}
              </div>
            ` : ""}
          </div>
          <div class="cs-mobile-right">
            <div class="cs-mobile-status">
              <h3>Status</h3>
              <p>${statusText}</p>
              ${mobileBuildUrl ? `<a class="cs-mobile-build-link" href="${escapeHtml(mobileBuildUrl)}" target="_blank" rel="noreferrer">Open build on Expo</a>` : ""}
            </div>
            <div class="cs-mobile-terminal">
              <h3>Build output</h3>
              <div class="cs-terminal-body" data-mobile-terminal>
                ${mobileBuildLogs.map((line) => `
                  <div class="cs-terminal-line ${/error|failed/i.test(line) ? "cs-terminal-error" : /success|done/i.test(line) ? "cs-terminal-success" : ""}">${escapeHtml(line)}</div>
                `).join("")}
                ${mobileLastError ? `<div class="cs-terminal-line cs-terminal-error">${escapeHtml(mobileLastError)}</div>` : ""}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const resetMobileBuildSteps = (): void => {
    mobileBuildSteps = mobileBuildSteps.map((step) => ({ ...step, status: "pending" }));
  };

  const startMobileBuild = async (): Promise<void> => {
    if (!caval?.startMobileBuild) return;
    mobileBuildStatus = "running";
    mobileBuildLogs = [];
    mobileLastError = "";
    mobileAiExplanation = "";
    mobileSuggestedCommands = [];
    mobileCanAutoFix = false;
    mobileBuildUrl = "";
    resetMobileBuildSteps();
    render();
    const result = await caval.startMobileBuild({ platform: mobilePlatform });
    if (!result.ok) {
      mobileBuildStatus = "error";
      mobileLastError = result.error ?? "Failed to start mobile build.";
      chatMessages = [...chatMessages, { role: "assistant", text: `[Mobile Build] ${mobileLastError}` }];
      render();
    }
  };

  const renderSidePanel = () => {
    if (activePanel === "search") {
      return `
        <header><strong>Search</strong><span>semantic + full text</span></header>
        <input class="panel-input" data-search placeholder="Search files..." />
        <div class="panel-list">
          ${files.filter((file) => !searchQuery || file.path.toLowerCase().includes(searchQuery.toLowerCase())).map((file) => `<button data-file="${file.path}">${file.path}</button>`).join("")}
        </div>
      `;
    }

    if (activePanel === "marketplace") {
      return `
        <header><strong>Marketplace</strong><span>extensions</span></header>
        <div class="panel-list">
          ${marketplaceItems.map((item) => `<button data-market="${item}">${item}<small>Install</small></button>`).join("")}
        </div>
      `;
    }

    if (activePanel === "source-control") {
      return `
        <header><strong>Source Control</strong><span>git</span></header>
        <div class="scm-empty">
          <p>No source control providers registered.</p>
          <p class="muted">Initialize a repository to enable Git source control, or publish this folder to GitHub.</p>
          <button data-scm-action="init">Initialize Repository</button>
          <button data-scm-action="publish">Publish to GitHub</button>
        </div>
      `;
    }

    if (activePanel === "run") {
      return `
        <header><strong>Run and Debug</strong><span>tasks</span></header>
        <div class="panel-list">
          <button data-run-action="debug">Start Debugging <small>F5</small></button>
          <button data-run-action="active-file">Run Active File <small>▶</small></button>
          <button data-run-action="build">Run Build Task <small>Ctrl+Shift+B</small></button>
        </div>
      `;
    }

    if (activePanel === "extensions") {
      return `
        <header><strong>Extensions</strong><span>installed</span></header>
        <div class="extensions-import-zone">
          <button class="extensions-import-cta" data-import-vsc-extensions>Click to import VSC extensions</button>
          <p class="extensions-import-hint">Importa extensii <code>.vsix</code> sau din folderul VS Code local.</p>
          <input type="file" accept=".vsix" hidden data-vsc-extension-input />
          ${extensionsImportStatus ? `<div class="extensions-import-status">${escapeHtml(extensionsImportStatus)}</div>` : ""}
          <button class="extensions-marketplace-link" data-open-marketplace>Browse Marketplace</button>
        </div>
        <div class="panel-list">
          ${marketplaceItems.map((item) => `<button data-market="${item}">${item}<small>enabled</small></button>`).join("")}
        </div>
      `;
    }

    if (activePanel === "problems") {
      return `
        <header><strong>Problems</strong><span>0 errors</span></header>
        <div class="panel-list">
          <button>No problems detected <small>ok</small></button>
          <button>Run typecheck <small>tsc</small></button>
        </div>
      `;
    }

    if (activePanel === "output") {
      return `
        <header><strong>Output</strong><span>build</span></header>
        <div class="terminal-preview">
          npm run typecheck ✓<br/>
          npm run build ✓<br/>
          renderer/workbench.js emitted
        </div>
      `;
    }

    if (activePanel === "debug") {
      return `
        <header><strong>Debug Console</strong><span>ready</span></header>
        <div class="terminal-preview">
          Debug session not started.<br/>
          Press F5 to start debugging.
        </div>
      `;
    }

    if (activePanel === "terminal") {
      return `
        <header><strong>Terminal</strong><span>embedded preview</span></header>
        <div class="terminal-preview">
          PS C:\\Users\\octav\\Desktop\\caval studio&gt; npm start<br/>
          Caval Studio running...
        </div>
      `;
    }

    if (activePanel === "settings") {
      return `
        <header><strong>Settings</strong><span>User</span></header>
        <div class="cursor-settings-nav">
          <input class="settings-search" placeholder="Search settings Ctrl+F" data-settings-search />
          ${["General", "VS Code Settings", "Plan & Usage", "Agents", "Tab", "Models", "Cloud Agents", "Plugins", "Rules, Skills, Subagents", "Tools & MCPs", "Hooks", "Indexing & Docs", "Network", "Beta", "Docs"].map((item) => `
            <button class="${activeSettingsCategory === item ? "active" : ""}" data-settings-category="${item}">
              <span>${iconForSettings(item)}</span>${item}${item === "Models" ? "<small>1</small>" : ""}
            </button>
          `).join("")}
        </div>
      `;
    }

    if (activePanel === "ai-suggestions") {
      return renderSuggestionsPanel();
    }

    if (activePanel === "code-review") {
      return renderCodeReviewPanel();
    }

    if (activePanel === "mobile-build") {
      return renderMobileBuildPanel();
    }

    if (activePanel === "logicflow") {
      return `<div id="logicflow-sidebar-root" class="logicflow-host"></div>`;
    }

    return `
      <header><strong>Explorer</strong><span>${workspaceName}</span></header>
      <div class="explorer-hint">Proiectul este incarcat automat. Click pe fisier ca sa-l deschizi in editor.</div>
      <div class="file-tree">
        ${renderFileTree(files)}
      </div>
    `;
  };

  const renderSettingsEditor = (): string => `
    <section class="settings-editor">
      <header class="settings-editor-header">
        <div>
          <p>Pro+ Plan</p>
          <h2>${activeSettingsCategory === "Models" ? "Caval Settings" : activeSettingsCategory}</h2>
        </div>
        <button data-close-settings="true">×</button>
      </header>
      ${renderSettingsContent()}
    </section>
  `;

  const renderSettingsContent = (): string => {
    if (activeSettingsCategory === "Models") {
      return `
        <div class="settings-models-page">
          <section class="models-list">
            ${models.map((model) => `
              <button class="${enabledModelIds.includes(model.id) ? "active" : ""}" data-settings-model="${model.id}">
                ${model.label}<small>${enabledModelIds.includes(model.id) ? "Added" : model.free ? "Free" : model.route}</small>
              </button>
            `).join("")}
          </section>
          <details class="api-keys" ${activeSettingsCategory === "Models" ? "open" : ""}>
            <summary>API Keys</summary>
            <label>Caval Cloud API Key <input data-setting="caval.cloud.apiKey" placeholder="ck_..." value="${escapeHtml(settingsState["caval.cloud.apiKey"])}" /></label>
            <label>OpenRouter API Key <input data-setting="openrouter.apiKey" placeholder="sk-or-..." value="${escapeHtml(settingsState["openrouter.apiKey"])}" /></label>
            <label>Ollama URL <input data-setting="ollama.url" value="${escapeHtml(settingsState["ollama.url"])}" /></label>
          </details>
        </div>
      `;
    }

    const actionPages: Record<string, Array<{ title: string; description: string; action: string; cta: string }>> = {
      "VS Code Settings": [
        { title: "Import VS Code settings", description: "Importa settings.json, keybindings si snippets.", action: "import-vscode-settings", cta: "Import" },
        { title: "Open settings JSON", description: "Editeaza setarile brute compatibile VS Code.", action: "open-settings-json", cta: "Open JSON" }
      ],
      "Plan & Usage": [
        { title: "Current plan", description: "Pro+ Plan activ local pentru preview.", action: "open-plan", cta: "View Plan" },
        { title: "Usage", description: "Vezi cereri AI, build minutes si marketplace sync.", action: "open-usage", cta: "View Usage" }
      ],
      Agents: [
        { title: "Composer Agent", description: "Planifica si aplica modificari multi-file.", action: "agent-composer", cta: "Configure" },
        { title: "Debug Agent", description: "Analizeaza erori si propune fix-uri.", action: "agent-debug", cta: "Configure" }
      ],
      Tab: [
        { title: "Tab autocomplete", description: "Activeaza completari rapide in editor.", action: "tab-autocomplete", cta: "Enable" },
        { title: "Inline edits", description: "Sugestii AI inline in editor.", action: "inline-edits", cta: "Enable" }
      ],
      "Cloud Agents": [
        { title: "Caval Cloud endpoint", description: "Conecteaza agentii la Caval Cloud.", action: "cloud-agent-endpoint", cta: "Connect" },
        { title: "Remote runs", description: "Ruleaza taskuri grele in cloud.", action: "remote-runs", cta: "Configure" }
      ],
      Plugins: [
        { title: "Installed plugins", description: "Administreaza pluginurile instalate.", action: "plugins-installed", cta: "Open" },
        { title: "Marketplace plugins", description: "Cauta pluginuri noi.", action: "plugins-marketplace", cta: "Browse" }
      ],
      "Rules, Skills, Subagents": [
        { title: "Project rules", description: "Reguli persistente pentru AI.", action: "rules", cta: "Open Rules" },
        { title: "Subagents", description: "Configureaza agenti specializati.", action: "subagents", cta: "Configure" }
      ],
      "Tools & MCPs": [
        { title: "MCP servers", description: "Administreaza servere MCP conectate.", action: "mcp-servers", cta: "Open MCPs" },
        { title: "Tool permissions", description: "Controleaza permisiunile tool-urilor.", action: "tool-permissions", cta: "Configure" }
      ],
      Hooks: [
        { title: "Agent hooks", description: "Automatizari la evenimente agent.", action: "agent-hooks", cta: "Configure" },
        { title: "Build hooks", description: "Ruleaza validari la build/release.", action: "build-hooks", cta: "Configure" }
      ],
      "Indexing & Docs": [
        { title: "Reindex workspace", description: "Reconstruieste Context Engine index.", action: "reindex", cta: "Reindex" },
        { title: "Docs sources", description: "Alege ce documentatie intra in context.", action: "docs-sources", cta: "Configure" }
      ],
      Network: [
        { title: "Proxy", description: "Configureaza proxy pentru cloud si marketplace.", action: "network-proxy", cta: "Configure" },
        { title: "Offline mode", description: "Foloseste doar modele locale.", action: "offline-mode", cta: "Enable" }
      ],
      Beta: [
        { title: "Beta features", description: "Activeaza functii experimentale Caval.", action: "beta-features", cta: "Enable" },
        { title: "Nightly channel", description: "Primeste update-uri nightly.", action: "nightly-channel", cta: "Switch" }
      ],
      Docs: [
        { title: "Caval docs", description: "Deschide documentatia locala.", action: "docs-open", cta: "Open Docs" },
        { title: "Generate docs", description: "Foloseste AI pentru README si docs.", action: "docs-generate", cta: "Generate" }
      ]
    };

    if (actionPages[activeSettingsCategory]) {
      return `
        <div class="settings-models-page">
          <section class="settings-action-page">
            ${actionPages[activeSettingsCategory].map((item) => `
              <article class="settings-action-card">
                <div>
                  <strong>${item.title}</strong>
                  <p>${item.description}</p>
                </div>
                <button data-settings-action="${item.action}">${item.cta}</button>
              </article>
            `).join("")}
          </section>
        </div>
      `;
    }

    const sectionsByCategory: Record<string, string[]> = {
      General: ["Commonly Used", "Workbench"],
      "VS Code Settings": ["Commonly Used"],
      "Plan & Usage": ["AI"],
      Agents: ["AI"],
      Tab: ["AI"],
      "Cloud Agents": ["AI"],
      Plugins: ["Marketplace"],
      "Rules, Skills, Subagents": ["AI"],
      "Tools & MCPs": ["AI"],
      Hooks: ["AI"],
      "Indexing & Docs": ["Commonly Used"],
      Network: ["AI", "Marketplace"],
      Beta: ["Workbench"],
      Docs: ["Commonly Used"],
      Terminal: ["Terminal"],
      Marketplace: ["Marketplace"]
    };
    const wanted = sectionsByCategory[activeSettingsCategory] ?? ["Commonly Used"];
    const sections = settingsSections.filter((section) => wanted.includes(section.title));

    return `
      <div class="settings-models-page">
        ${sections.map((section) => `
          <section class="settings-section">
            <h3>${section.title}</h3>
            ${section.items.map((item) => renderSettingItem({ ...item, value: settingsState[item.key] ?? item.value })).join("")}
          </section>
        `).join("")}
      </div>
    `;
  };

  const iconForSettings = (item: string): string => {
    const icons: Record<string, string> = {
      General: "⚙",
      "VS Code Settings": "⌘",
      "Plan & Usage": "▣",
      Agents: "⌁",
      Tab: "↹",
      Models: "◉",
      "Cloud Agents": "☁",
      Plugins: "⌘",
      "Rules, Skills, Subagents": "▤",
      "Tools & MCPs": "◆",
      Hooks: "⚡",
      "Indexing & Docs": "◫",
      Network: "◎",
      Beta: "⚗",
      Docs: "□"
    };
    return icons[item] ?? "•";
  };

  const renderSettingItem = (item: { key: string; label: string; description: string; control: string; value: string; options?: string[] }): string => {
    const control = item.control === "toggle"
      ? `<button class="settings-toggle ${item.value === "true" ? "is-on" : ""}" data-setting="${item.key}" type="button"><span></span></button>`
      : item.control === "select"
        ? `<select data-setting="${item.key}">${(item.options ?? []).map((option) => `<option value="${option}" ${option === item.value ? "selected" : ""}>${option}</option>`).join("")}</select>`
        : `<input data-setting="${item.key}" type="number" value="${item.value}" />`;

    return `
      <article class="settings-item" data-setting-row="${item.key} ${item.label} ${item.description}">
        <div>
          <strong>${item.label}</strong>
          <p>${item.description}</p>
          <code>${item.key}</code>
        </div>
        ${control}
      </article>
    `;
  };

  const applySetting = (key: string, value: string): void => {
    settingsState[key] = value;
    if (key === "caval.ai.defaultModel") {
      selectedModel = value;
    }
    if (key === "caval.ai.mode") {
      composerMode = value === "plan" ? "plan" : "ask";
    }
    void (window as unknown as { caval?: { settingsSave?: (s: Record<string, string>) => Promise<{ ok: boolean }> } }).caval?.settingsSave?.({ ...settingsState });
  };

  const displayPathForFile = (file: WorkspaceFile): string => file.label && file.label !== file.path ? file.label : file.path;

  const buildFileTree = (workspaceFiles: WorkspaceFile[]): FileTreeNode => {
    const rootNode: FileTreeNode = { name: workspaceName, path: "", children: new Map() };

    for (const file of workspaceFiles) {
      const parts = displayPathForFile(file).split(/[\\/]/).filter(Boolean);
      let current = rootNode;
      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        const nodePath = parts.slice(0, index + 1).join("/");
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: nodePath,
            children: new Map()
          });
        }
        current = current.children.get(part)!;
        if (isFile) {
          current.file = file;
        }
      });
    }

    return rootNode;
  };

  const renderFileTree = (workspaceFiles: WorkspaceFile[]): string => {
    const rootNode = buildFileTree(workspaceFiles);
    return [...rootNode.children.values()]
      .sort(sortTreeNodes)
      .map((node) => renderTreeNode(node, 0))
      .join("");
  };

  const sortTreeNodes = (left: FileTreeNode, right: FileTreeNode): number => {
    if (!left.file && right.file) return -1;
    if (left.file && !right.file) return 1;
    return left.name.localeCompare(right.name);
  };

  const renderTreeNode = (node: FileTreeNode, depth: number): string => {
    if (node.file) {
      return `
        <button class="tree-file ${node.file.path === activeFile.path ? "active" : ""}" data-file="${node.file.path}" style="--depth:${depth}">
          <span class="tree-icon">${iconForFile(node.name)}</span>
          <span>${node.name}</span>
        </button>
      `;
    }

    return `
      <details class="tree-folder" open style="--depth:${depth}">
        <summary><span class="tree-icon">▸</span><span>${node.name}</span></summary>
        <div>
          ${[...node.children.values()].sort(sortTreeNodes).map((child) => renderTreeNode(child, depth + 1)).join("")}
        </div>
      </details>
    `;
  };

  const iconForFile = (name: string): string => {
    if (name.endsWith(".ts") || name.endsWith(".tsx")) return "TS";
    if (name.endsWith(".json")) return "{}";
    if (name.endsWith(".md")) return "MD";
    if (name.endsWith(".js")) return "JS";
    return "•";
  };

  const openFile = (path: string) => {
    const file = files.find((candidate) => candidate.path === path);
    if (!file) return;
    activeFile = file;
    if (!openedFiles.some((opened) => opened.path === file.path)) {
      openedFiles = [...openedFiles, file];
    }
    render();
  };

  const upsertFile = (file: WorkspaceFile): void => {
    const existingIndex = files.findIndex((candidate) => candidate.path === file.path);
    if (existingIndex >= 0) {
      files.splice(existingIndex, 1, file);
    } else {
      files = [file, ...files];
    }
    activeFile = file;
    if (!openedFiles.some((opened) => opened.path === file.path)) {
      openedFiles = [file, ...openedFiles];
    } else {
      openedFiles = openedFiles.map((opened) => opened.path === file.path ? file : opened);
    }
    activePanel = "explorer";
    render();
  };

  const newTextFile = (): void => {
    const count = files.filter((file) => file.path.startsWith("untitled-")).length + 1;
    upsertFile({
      path: `untitled-${count}.ts`,
      label: `untitled-${count}.ts`,
      language: "typescript",
      content: "",
      dirty: true
    });
  };

  const saveActiveFile = async (saveAs = false): Promise<void> => {
    const result = await caval?.saveFile({
      path: activeFile.path.startsWith("untitled-") ? undefined : activeFile.path,
      content: activeFile.content,
      saveAs
    });
    if (!result || result.canceled || !result.path) return;
    const saved = {
      ...activeFile,
      path: result.path,
      label: result.label ?? activeFile.label,
      language: result.language ?? activeFile.language,
      dirty: false
    };
    files = files.map((file) => file === activeFile || file.path === activeFile.path ? saved : file);
    openedFiles = openedFiles.map((file) => file === activeFile || file.path === activeFile.path ? saved : file);
    activeFile = saved;
    render();
  };

  const showPalette = () => {
    const palette = root.querySelector<HTMLElement>(".palette");
    palette?.removeAttribute("hidden");
    palette?.querySelector<HTMLInputElement>("input")?.focus();
  };

  const hidePalette = () => {
    root.querySelector<HTMLElement>(".palette")?.setAttribute("hidden", "");
  };

  const openTerminal = async (): Promise<void> => {
    terminalOpen = true;
    activePanel = "explorer";
    render();
    await caval?.startTerminal();
  };

  const sendComposerMessage = async (text: string): Promise<void> => {
    if (!text.trim()) return;
    const modelLabel = models.find((model) => model.id === selectedModel)?.label ?? selectedModel;
    const modeLabel = composerMode === "plan" ? "Plan" : "Ask";
    lastComposerObjective = text;
    chatMessages = [
      ...chatMessages,
      { role: "user", text: `[${modeLabel} · ${modelLabel}] ${text}` },
      { role: "assistant", text: "Thinking..." }
    ];
    render();

    if (composerMode === "plan" && caval?.composerRun) {
      syncLogicFlowPhase("running");
      const result = await caval.composerRun({ objective: text, mode: "plan" });
      syncLogicFlowPhase(result.phase);
      if (result.phase === "awaiting_suggestions" && result.suggestions) {
        suggestionsSession = result.suggestions;
        activePanel = "ai-suggestions";
        chatMessages = [
          ...chatMessages.slice(0, -1),
          { role: "assistant", text: `[Suggestions]\n${result.suggestions.summary.headline}\n\nRevizuiește sugestiile în panoul AI Suggestions, apoi apasă Proceed.` }
        ];
        render();
        return;
      }
      if (result.phase === "awaiting_review" && result.review) {
        reviewSession = result.review;
        selectedReviewFileId = result.review.files[0]?.id ?? "";
        activePanel = "code-review";
        chatMessages = [
          ...chatMessages.slice(0, -1),
          { role: "assistant", text: `[Code Review]\n${result.review.summary}\n\n${result.review.files.length} fișiere modificate. Revizuiește patch-urile înainte de apply.` }
        ];
        render();
        return;
      }
      if (result.phase === "completed") {
        chatMessages = [
          ...chatMessages.slice(0, -1),
          { role: "assistant", text: `[Composer]\nModificări aplicate: ${result.changedFiles.join(", ") || "none"}${result.rolledBack ? "\nRollback executat din cauza erorilor." : ""}` }
        ];
        render();
        return;
      }
    }

    const response = await caval?.chat({
      message: text,
      model: selectedModel,
      mode: composerMode,
      context: {
        filePath: activeFile.path,
        fileContent: activeFile.content
      }
    });
    const provider = response?.provider === "cloud" ? "Caval Cloud" : response?.provider === "ollama" ? "Ollama local" : "No provider";
    chatMessages = [
      ...chatMessages.slice(0, -1),
      {
        role: "assistant",
        text: response?.ok
          ? `[${provider}]\n${response.content}`
          : `[${provider}]\n${response?.content ?? "AI request failed."}${response?.error ? `\n\nError:\n${response.error}` : ""}`
      }
    ];
    render();
  };

  const wireEvents = () => {
    root.querySelector<HTMLInputElement>("[data-search]")?.addEventListener("input", (event) => {
      searchQuery = (event.target as HTMLInputElement).value;
      render();
    });

    root.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        activePanel = button.dataset.panel as Panel;
        if (activePanel === "settings") {
          settingsOpen = true;
          activeSettingsCategory = "Models";
        } else {
          settingsOpen = false;
        }
        render();
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-extension-promo]").forEach((button) => {
      button.addEventListener("click", () => {
        activePanel = "extensions";
        settingsOpen = false;
        extensionsImportStatus = `Featured: ${button.dataset.extensionPromo ?? "extension"} — open import to install.`;
        render();
      });
    });

    root.querySelector<HTMLButtonElement>("[data-import-vsc-extensions]")?.addEventListener("click", () => {
      root.querySelector<HTMLInputElement>("[data-vsc-extension-input]")?.click();
    });

    root.querySelector<HTMLInputElement>("[data-vsc-extension-input]")?.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      extensionsImportStatus = `Imported: ${file.name} — VS Code compatibility check pending.`;
      terminalOutput += `\r\n[Extensions] Import queued: ${file.name}\r\n`;
      chatMessages = [...chatMessages, { role: "assistant", text: `[Extensions] Imported ${file.name}. VS Code extension will run through the Caval compatibility adapter.` }];
      input.value = "";
      render();
    });

    root.querySelector<HTMLButtonElement>("[data-open-marketplace]")?.addEventListener("click", () => {
      activePanel = "marketplace";
      settingsOpen = false;
      render();
    });

    root.querySelectorAll<HTMLButtonElement>("[data-scm-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.scmAction;
        if (action === "init") {
          terminalOutput += "\r\nPS> git init\r\nInitialized empty Git repository in caval studio/.git/\r\n";
          terminalOpen = true;
          chatMessages = [...chatMessages, { role: "assistant", text: "[Source Control] Repository initialized. Run git commands in the integrated terminal." }];
        }
        if (action === "publish") {
          chatMessages = [...chatMessages, { role: "assistant", text: "[Source Control] Connect your GitHub account to publish this repository. Sign in via Settings > Network when available." }];
        }
        render();
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-settings-category]").forEach((button) => {
      button.addEventListener("click", () => {
        activeSettingsCategory = button.dataset.settingsCategory ?? "Models";
        settingsOpen = true;
        render();
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-settings-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.settingsAction ?? "settings-action";
        if (action.includes("marketplace") || action.includes("plugins")) {
          activePanel = "marketplace";
          settingsOpen = false;
        }
        if (action.includes("mcp") || action.includes("rules") || action.includes("agent")) {
          activePanel = "settings";
        }
        if (action === "reindex") {
          chatMessages = [...chatMessages, { role: "assistant", text: "Context Engine reindex queued." }];
          settingsOpen = false;
        }
        if (action === "docs-open" || action === "docs-generate") {
          activePanel = "explorer";
          settingsOpen = false;
        }
        chatMessages = [...chatMessages, { role: "assistant", text: `Settings action executed: ${action}` }];
        render();
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-settings-model]").forEach((button) => {
      button.addEventListener("click", () => {
        const modelId = button.dataset.settingsModel;
        if (!modelId) return;
        if (!enabledModelIds.includes(modelId)) {
          enabledModelIds = [...enabledModelIds, modelId];
          chatMessages = [...chatMessages, { role: "assistant", text: `${models.find((model) => model.id === modelId)?.label ?? modelId} a fost adaugat in dropdown-ul chatului.` }];
        } else {
          chatMessages = [...chatMessages, { role: "assistant", text: `${models.find((model) => model.id === modelId)?.label ?? modelId} este deja in dropdown-ul chatului.` }];
        }
        render();
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-suggestion-alt]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!suggestionsSession) return;
        suggestionsSession = {
          ...suggestionsSession,
          selectedAlternativeId: button.dataset.suggestionAlt
        };
        render();
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-suggestion-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!suggestionsSession || !caval?.suggestionsProceed) return;
        const action = button.dataset.suggestionAction;
        if (action === "reject") {
          suggestionsSession = null;
          chatMessages = [...chatMessages, { role: "assistant", text: "Sugestiile au fost respinse. Composer oprit." }];
          render();
          return;
        }
        if (action === "approve" && caval.suggestionsApprove) {
          await caval.suggestionsApprove({
            sessionId: suggestionsSession.id,
            alternativeId: suggestionsSession.selectedAlternativeId
          });
          chatMessages = [...chatMessages, { role: "assistant", text: "Directia aprobata. Poti continua catre generarea patch-urilor." }];
          render();
          return;
        }
        if (action === "proceed") {
          syncLogicFlowPhase("running");
          const result = await caval.suggestionsProceed({
            sessionId: suggestionsSession.id,
            objective: lastComposerObjective || suggestionsSession.request,
            alternativeId: suggestionsSession.selectedAlternativeId
          });
          syncLogicFlowPhase(result.phase);
          if (result.phase === "awaiting_review" && result.review) {
            reviewSession = result.review;
            selectedReviewFileId = result.review.files[0]?.id ?? "";
            activePanel = "code-review";
            chatMessages = [...chatMessages, { role: "assistant", text: `[Code Review]\nPatch-uri generate. Revizuiește înainte de apply.` }];
          } else {
            chatMessages = [...chatMessages, { role: "assistant", text: `[Composer]\nFaza: ${result.phase}` }];
          }
          render();
        }
      });
    });

    root.querySelectorAll<HTMLElement>("[data-review-action]").forEach((element) => {
      element.addEventListener("click", async () => {
        if (!reviewSession || !caval?.reviewAction) return;
        const action = element.dataset.reviewAction;
        const targetId = element.dataset.targetId;
        if (!action) return;

        if (action === "apply" && caval.reviewApply) {
          syncLogicFlowPhase("running");
          const result = await caval.reviewApply({
            sessionId: reviewSession.id,
            objective: lastComposerObjective
          });
          syncLogicFlowPhase(result.phase);
          chatMessages = [...chatMessages, {
            role: "assistant",
            text: result.ok
              ? `[Composer] Patch-uri aplicate: ${result.changedFiles.join(", ") || "none"}`
              : `[Composer] Apply esuat. Faza: ${result.phase}`
          }];
          if (result.ok) reviewSession = null;
          render();
          return;
        }

        const updated = await caval.reviewAction({
          action: action as "acceptAll" | "rejectAll" | "acceptFile" | "rejectFile" | "acceptHunk" | "rejectHunk" | "acceptLine" | "rejectLine" | "askAIToRevise",
          targetId
        });
        if (updated) {
          reviewSession = updated;
          render();
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-review-file]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedReviewFileId = button.dataset.reviewFile ?? "";
        render();
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-mobile-platform]").forEach((button) => {
      button.addEventListener("click", () => {
        mobilePlatform = (button.dataset.mobilePlatform as MobilePlatform) ?? "android";
        render();
      });
    });

    root.querySelector<HTMLButtonElement>("[data-mobile-tutorial-open]")?.addEventListener("click", () => {
      mobileTutorialOpen = true;
      render();
    });

    root.querySelector<HTMLButtonElement>("[data-mobile-tutorial-close]")?.addEventListener("click", () => {
      mobileTutorialOpen = false;
      render();
    });

    root.querySelectorAll<HTMLButtonElement>("[data-mobile-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.mobileAction;
        if (action === "start" || action === "rerun") {
          await startMobileBuild();
          return;
        }
        if (action === "cancel") {
          await caval?.cancelMobileBuild?.();
          mobileBuildStatus = "idle";
          render();
          return;
        }
        if (action === "fix-ai") {
          chatMessages = [...chatMessages, {
            role: "assistant",
            text: `[Mobile Build AI]\n${mobileAiExplanation || mobileLastError}\n\nSuggested:\n${mobileSuggestedCommands.join("\n") || "npx expo doctor"}`
          }];
          render();
          return;
        }
        if (action === "auto-fix") {
          const command = button.dataset.fixCommand;
          if (command) {
            await caval?.fixMobileBuild?.({ command });
            chatMessages = [...chatMessages, { role: "assistant", text: `[Mobile Build] Running fix: ${command}` }];
            render();
          }
        }
      });
    });

    root.querySelector<HTMLButtonElement>("[data-close-settings='true']")?.addEventListener("click", () => {
      settingsOpen = false;
      activePanel = "explorer";
      render();
    });

    root.querySelectorAll<HTMLButtonElement>("[data-file]").forEach((button) => {
      button.addEventListener("click", () => openFile(button.dataset.file ?? ""));
    });

    root.querySelector<HTMLButtonElement>("[data-command='palette']")?.addEventListener("click", showPalette);
    root.querySelector<HTMLButtonElement>("[data-command='composer']")?.addEventListener("click", () => void sendComposerMessage(`Explica ${activeFile.label}`));

    root.querySelector<HTMLTextAreaElement>("[data-editor]")?.addEventListener("input", (event) => {
      const content = (event.target as HTMLTextAreaElement).value;
      activeFile = { ...activeFile, content, dirty: true };
      files = files.map((file) => file.path === activeFile.path ? activeFile : file);
      openedFiles = openedFiles.map((file) => file.path === activeFile.path ? activeFile : file);
      root.querySelector(".global-statusbar span:nth-child(2)")!.textContent = `${activeFile.path} • unsaved`;
    });

    root.querySelectorAll<HTMLButtonElement>("[data-market]").forEach((button) => {
      button.addEventListener("click", () => {
        chatMessages = [...chatMessages, { role: "assistant", text: `${button.dataset.market} a fost instalat in demo.` }];
        render();
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-run-action]").forEach((button) => {
      button.addEventListener("click", () => {
        chatMessages = [...chatMessages, { role: "assistant", text: `Run action: ${button.dataset.runAction} a fost pornit in demo.` }];
        render();
      });
    });

    root.querySelector<HTMLInputElement>("[data-settings-search]")?.addEventListener("input", (event) => {
      const query = (event.target as HTMLInputElement).value.toLowerCase();
      root.querySelectorAll<HTMLElement>("[data-setting-row]").forEach((row) => {
        row.hidden = !row.dataset.settingRow?.toLowerCase().includes(query);
      });
    });

    root.querySelectorAll<HTMLButtonElement>(".settings-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        button.classList.toggle("is-on");
        const key = button.dataset.setting;
        if (key) {
          applySetting(key, button.classList.contains("is-on") ? "true" : "false");
        }
      });
    });

    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]").forEach((control) => {
      control.addEventListener("change", () => {
        applySetting(control.dataset.setting ?? "", control.value);
        render();
      });
      control.addEventListener("input", () => {
        if (control instanceof HTMLInputElement && control.type !== "number") {
          applySetting(control.dataset.setting ?? "", control.value);
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-terminal-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.terminalAction;
        if (action === "new") {
          terminalOutput += "\r\n--- new terminal requested ---\r\n";
          await caval?.stopTerminal();
          await caval?.startTerminal();
        }
        if (action === "stop") {
          await caval?.stopTerminal();
          terminalOutput += "\r\n[terminal killed]\r\n";
        }
        if (action === "close") {
          terminalOpen = false;
        }
        render();
      });
    });

    root.querySelector<HTMLFormElement>(".terminal-input")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = root.querySelector<HTMLInputElement>(".terminal-input input");
      const command = input?.value ?? "";
      if (!command.trim()) return;
      terminalOutput += `> ${command}\r\n`;
      input!.value = "";
      await caval?.writeTerminal(`${command}\r\n`);
      render();
    });

    root.querySelector<HTMLFormElement>(".chat-input")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = root.querySelector<HTMLTextAreaElement>(".chat-input textarea");
      const value = input?.value ?? "";
      if (input) {
        input.value = "";
      }
      void sendComposerMessage(value);
    });

    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        composerMode = button.dataset.mode === "plan" ? "plan" : "ask";
        render();
      });
    });

    root.querySelector<HTMLSelectElement>("[data-model]")?.addEventListener("change", (event) => {
      selectedModel = (event.target as HTMLSelectElement).value;
      render();
    });

    root.querySelector<HTMLElement>(".palette")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) hidePalette();
    });

    root.querySelectorAll<HTMLButtonElement>("[data-palette-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.paletteAction;
        hidePalette();
        if (action === "marketplace") activePanel = "marketplace";
        if (action === "search") activePanel = "search";
        if (action === "context") {
          chatMessages = [...chatMessages, { role: "assistant", text: "Context Engine index refreshed." }];
        }
        if (action === "composer") void sendComposerMessage("Porneste Composer pentru fisierul activ");
        render();
      });
    });

    const mountLogicFlow = (): void => {
      const lf = logicFlowGlobal();
      if (!lf) return;

      if (activePanel !== "logicflow") {
        lf.unmount();
        return;
      }

      const sidebar = root.querySelector<HTMLElement>("#logicflow-sidebar-root");
      const canvas = root.querySelector<HTMLElement>("#logicflow-canvas-root");
      const inspector = root.querySelector<HTMLElement>("#logicflow-inspector-root");
      if (!sidebar || !canvas || !inspector) return;

      lf.mount({ sidebar, canvas, inspector });
    };

    mountLogicFlow();
  };

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      showPalette();
    }
    if (event.key === "Escape") hidePalette();
  });

  caval?.onMenuCommand((command) => {
    if (command === "new-file") newTextFile();
    if (command === "save") void saveActiveFile(false);
    if (command === "save-as") void saveActiveFile(true);
    if (command === "palette") showPalette();
    if (command === "open-view") showPalette();
    if (command === "find" || command === "find-in-files" || command === "replace" || command === "replace-in-files") {
      activePanel = "search";
      render();
    }
    if (command === "view-explorer") {
      activePanel = "explorer";
      render();
    }
    if (command === "view-search") {
      activePanel = "search";
      render();
    }
    if (command === "view-source-control") {
      activePanel = "source-control";
      render();
    }
    if (command === "view-run") {
      activePanel = "run";
      render();
    }
    if (command === "view-extensions") {
      activePanel = "extensions";
      render();
    }
    if (command === "view-problems" || command === "next-problem" || command === "previous-problem") {
      activePanel = "problems";
      render();
    }
    if (command === "view-output") {
      activePanel = "output";
      render();
    }
    if (command === "view-debug-console" || command.includes("debug")) {
      activePanel = "debug";
      render();
    }
    if (command === "composer") void sendComposerMessage(`Explica ${activeFile.label}`);
    if (command === "marketplace") {
      activePanel = "marketplace";
      render();
    }
    if (command.startsWith("terminal")) {
      void openTerminal();
    }
    if (command.startsWith("task-")) {
      terminalOpen = true;
      terminalOutput += `\r\n> ${command}\r\nTask command queued. Use the terminal input to run npm scripts.\r\n`;
      void caval?.startTerminal();
      render();
    }
    if (command.startsWith("go-to") || command.startsWith("selection") || command.includes("line") || command.includes("cursor") || command.includes("comment") || command.includes("emmet") || command.includes("symbol")) {
      chatMessages = [...chatMessages, { role: "assistant", text: `Comanda "${command}" este conectata in UI. Urmatorul pas este integrarea cu editor service real.` }];
      render();
    }
    if (command === "word-wrap") {
      chatMessages = [...chatMessages, { role: "assistant", text: "Word Wrap toggled in demo." }];
      render();
    }
    if (command === "split-editor" || command === "single-editor") {
      chatMessages = [...chatMessages, { role: "assistant", text: `Editor layout command: ${command}.` }];
      render();
    }
    if (command === "about") {
      chatMessages = [...chatMessages, { role: "assistant", text: "Caval Studio 0.1.0 - IDE romanesc cu AI Composer si Context Engine." }];
      render();
    }
    if (["editor-playground", "accessibility", "feedback", "license", "process-explorer", "check-updates"].includes(command)) {
      chatMessages = [...chatMessages, { role: "assistant", text: `Help: ${command}.` }];
      render();
    }
  });

  caval?.onFileOpened((file) => {
    upsertFile({ ...file, dirty: false });
  });

  caval?.onFolderOpened((folder) => {
    workspaceName = folder.path.split(/[\\/]/).at(-1) ?? folder.path;
    files = folder.files.length > 0 ? folder.files.map((file) => ({ ...file, dirty: false })) : files;
    activeFile = files[0];
    openedFiles = [activeFile];
    activePanel = "explorer";
    render();
  });

  caval?.ready();

  caval?.onLogicFlowPipelineStep?.((step) => {
    syncLogicFlowStep(step);
  });

  caval?.onPipelineEvent?.((pipelineEvent) => {
    (window as unknown as { CavalLogicFlow?: { forwardEvent?: (e: unknown) => void } }).CavalLogicFlow?.forwardEvent?.(pipelineEvent);
  });

  caval?.onTerminalData((data) => {
    terminalOutput += data;
    if (terminalOutput.length > 20_000) {
      terminalOutput = terminalOutput.slice(-20_000);
    }
    const output = root.querySelector<HTMLElement>(".terminal-output");
    if (output) {
      output.textContent = terminalOutput;
      output.scrollTop = output.scrollHeight;
    }
  });

  caval?.onMobileBuildData?.((line) => {
    mobileBuildLogs.push(line);
    if (mobileBuildLogs.length > 500) {
      mobileBuildLogs = mobileBuildLogs.slice(-500);
    }
    const terminal = root.querySelector<HTMLElement>("[data-mobile-terminal]");
    if (terminal && activePanel === "mobile-build") {
      const row = document.createElement("div");
      row.className = `cs-terminal-line ${/error|failed/i.test(line) ? "cs-terminal-error" : /success|done/i.test(line) ? "cs-terminal-success" : ""}`;
      row.textContent = line;
      terminal.appendChild(row);
      terminal.scrollTop = terminal.scrollHeight;
    }
  });

  caval?.onMobileBuildError?.((analysis) => {
    mobileBuildStatus = "error";
    mobileLastError = analysis.explanation.split("\n")[0] ?? "Build error detected.";
    mobileAiExplanation = analysis.explanation;
    mobileSuggestedCommands = analysis.suggestedCommands;
    mobileCanAutoFix = analysis.canAutoFix;
    chatMessages = [...chatMessages, {
      role: "assistant",
      text: `[Mobile Build AI]\n${analysis.explanation}\n\nSuggested commands:\n${analysis.suggestedCommands.join("\n") || "npx expo doctor"}`
    }];
    render();
  });

  caval?.onMobileBuildStep?.(({ stepId, status }) => {
    mobileBuildSteps = mobileBuildSteps.map((step) =>
      step.id === stepId ? { ...step, status: status as MobileBuildStepStatus } : step
    );
    if (activePanel === "mobile-build") {
      render();
    }
  });

  caval?.onMobileBuildComplete?.((result) => {
    mobileBuildStatus = result.ok ? "success" : "error";
    if (result.ok) {
      chatMessages = [...chatMessages, { role: "assistant", text: "[Mobile Build] Pipeline completed successfully." }];
    }
    render();
  });

  const escapeHtml = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

  render();
}
