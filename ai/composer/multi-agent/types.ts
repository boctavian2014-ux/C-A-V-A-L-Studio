export type MultiAgentStageId =
  | 'memory'
  | 'integrate'
  | 'context'
  | 'modelOrch'
  | 'orchestrator'
  | 'decompose'
  | 'subagent'
  | 'merge'
  | 'supervisor'
  | 'compose'
  | 'userSim'
  | 'security'
  | 'performance';

export type ArenaAgentRole =
  | 'implementer'
  | 'tester'
  | 'refactorer'
  | 'implementer-fix'
  | 'implementer-perf';

export type ArenaIssueSeverity = 'critical' | 'major' | 'minor';

export interface ArenaIssue {
  severity: ArenaIssueSeverity;
  source: string;
  file?: string;
  message: string;
  fix?: string;
}

export interface ArenaScanSummary {
  userSim?: string;
  security?: string;
  performance?: string;
  consistency?: string;
}

export type StageStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface PipelineTask {
  id: string;
  module: string;
  purpose: string;
  description: string;
  dependencies: string[];
  phase?: 'ui' | 'core';
  role?: ArenaAgentRole;
}

export interface SubAgentResult {
  taskId: string;
  modelId: string;
  output: string;
  ok: boolean;
  error?: string;
}

export interface SupervisorIssue {
  severity: 'critical' | 'major' | 'minor';
  module?: string;
  taskId?: string;
  message: string;
  fix?: string;
}

export interface SupervisorResult {
  approved: boolean;
  raw: string;
  issues: SupervisorIssue[];
  summary: string;
}

export interface ReasoningBrief {
  goal: string;
  approach: string;
  modules: string[];
}

export interface ReasoningLayerConfig {
  enabled: boolean;
  showEarlyBrief: boolean;
  showFinalRecap: boolean;
  showPipelineTimeline: boolean;
  showLiveReasoning: boolean;
  showHorseWaitAnimation: boolean;
  waitMessageRotateMs: number;
}

export const DEFAULT_REASONING_LAYER_CONFIG: ReasoningLayerConfig = {
  enabled: true,
  showEarlyBrief: true,
  showFinalRecap: true,
  showPipelineTimeline: true,
  showLiveReasoning: true,
  showHorseWaitAnimation: true,
  waitMessageRotateMs: 4800,
};

export interface PipelineRecapMeta {
  taskCount: number;
  fastPipeline: boolean;
  pendingIssues: string[];
  composeWaves?: number;
  devTools?: DevToolsIntegrationResult;
  supervisor?: SupervisorResult;
  completionGate?: import('../project-completion-gate').CompletionGateResult;
  deliveryBlocked?: boolean;
  needsReview?: boolean;
  verifyPending?: boolean;
  /** Snapshot of fullDelivery config used by the pipeline (for renderer autonomous loop). */
  fullDelivery?: FullDeliveryConfig;
  /** Final role → model map from Model Orchestrator LLM. */
  roleModelMap?: Partial<Record<ArenaAgentRole | 'architect' | 'coordinator', string>>;
}

export interface FullDeliveryConfig {
  enabled: boolean;
  maxComposeWaves: number;
  autoContinue: boolean;
  uiCheckpoint: boolean;
  /** Minimum fenced files per compose wave before stopping (scaled by task count). */
  minFencesPerTask: number;
  /** Minimum absolute fenced files before a wave can end early. */
  minFencesAbsolute: number;
  /** Auto-continue repair loops until gate OK or maxRepairWaves (no user DELIVERY_CONTINUE). */
  autonomousFinish: boolean;
  /** Max autonomous repair waves (gate/verify/consistency) after pipeline compose. */
  maxRepairWaves: number;
  /** Max arena consistency repair waves inside pipeline compose stage. */
  maxArenaRepairWaves: number;
  /** Max gate verify repair waves after devtools verify fails. */
  maxGateRepairWaves: number;
  /** Run npm install before verify when package.json changed or deps missing. */
  autoInstallDependencies: boolean;
}

export const DEFAULT_FULL_DELIVERY_CONFIG: FullDeliveryConfig = {
  enabled: true,
  maxComposeWaves: 3,
  autoContinue: true,
  uiCheckpoint: false,
  minFencesPerTask: 2,
  minFencesAbsolute: 4,
  autonomousFinish: true,
  maxRepairWaves: 8,
  maxArenaRepairWaves: 1,
  maxGateRepairWaves: 1,
  autoInstallDependencies: true,
};

export interface PipelineContext {
  userIntent: string;
  normalizedRequirements: string;
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  platformConstraints: string[];
  storeCompliance: string[];
  architectureContext: string;
  moduleContext: string;
  interfaceContext: string;
  dependencyMap: string;
  pendingIssues: string[];
}

export interface ExecutionPlan {
  runId: string;
  agentOrder: MultiAgentStageId[];
  taskDistributionMap: Record<string, string>;
  roleModelMap?: Partial<Record<ArenaAgentRole | 'architect' | 'coordinator', string>>;
  createdAt: number;
}

export interface StageRecord {
  id: MultiAgentStageId;
  status: StageStatus;
  detail?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface PipelineState {
  runId: string;
  userMessage: string;
  workspaceRoot: string;
  model: string;
  context: PipelineContext;
  tasks: PipelineTask[];
  plan?: ExecutionPlan;
  subAgentResults: SubAgentResult[];
  decompositionRaw?: string;
  mergeRaw?: string;
  supervisor?: SupervisorResult;
  stages: StageRecord[];
  composerText: string;
  aborted: boolean;
  devTools?: DevToolsIntegrationResult;
  integrationSummary?: IntegrationSummary;
  reasoningBrief?: ReasoningBrief;
  roleModelMap?: Partial<Record<ArenaAgentRole | 'architect' | 'coordinator', string>>;
}

export interface DevToolsIntegrationResult {
  git?: {
    isRepo: boolean;
    branch?: string;
    changedFiles?: number;
    remoteUrl?: string;
  };
  mcp?: { serversReady: number };
  terminal?: {
    packageJson?: boolean;
    testScript?: boolean;
    buildScript?: boolean;
  };
  verify?: {
    ran: boolean;
    summary: string;
    commands: Array<{ command: string; ok: boolean; exitCode: number | null; output: string }>;
  };
  github?: { remoteUrl?: string };
}

export interface IntegrationSummary {
  overview: string;
  agentOrder: string;
  contextSyncMap: Record<string, string>;
  subAgentMap: Record<string, string>;
  mergeStatus: string;
  supervisorStatus: string;
  composeStatus: string;
  devToolsStatus: string;
  runtimeStatus: string;
}

export interface MultiAgentConfig {
  enabled: boolean;
  maxTasks: number;
  parallelSubAgents: number;
  supervisorRetries: number;
  persistArtifacts: boolean;
  /** Skip slow LLM context capture — use instant heuristic context */
  skipContextLlm: boolean;
  /** Skip merge + supervisor LLM stages — go to composer after sub-agents */
  fastPipeline: boolean;
  /** Retry decomposition when parser collapses to single task but raw hints multiple modules */
  antiCollapseDecomposition: boolean;
  /** Max output tokens for decomposition stage */
  decompositionMaxTokens: number;
  /** Post-compose Git/MCP/terminal probes */
  enableDevToolsIntegration: boolean;
  /** Deliver output when LLM supervisor rejects (tag [NEEDS_REVIEW]) */
  supervisorFallback: boolean;
  /** Auto-boost limits on long / multi-module prompts */
  applyComplexPromptOverrides: boolean;
  /** Run npm verify in background — do not block pipeline return */
  devtoolsAsyncVerify: boolean;
  reasoningLayer: ReasoningLayerConfig;
  fullDelivery: FullDeliveryConfig;
}

export const DEFAULT_MULTI_AGENT_CONFIG: MultiAgentConfig = {
  enabled: true,
  maxTasks: 8,
  parallelSubAgents: 2,
  supervisorRetries: 1,
  persistArtifacts: true,
  skipContextLlm: true,
  fastPipeline: true,
  antiCollapseDecomposition: true,
  decompositionMaxTokens: 8192,
  enableDevToolsIntegration: true,
  supervisorFallback: true,
  applyComplexPromptOverrides: true,
  devtoolsAsyncVerify: true,
  reasoningLayer: { ...DEFAULT_REASONING_LAYER_CONFIG },
  fullDelivery: { ...DEFAULT_FULL_DELIVERY_CONFIG },
};

export interface MultiAgentPipelineCallbacks {
  onMultiAgentStatus?: (
    stage: MultiAgentStageId,
    status: 'active' | 'done',
    detail?: string,
    modelId?: string,
    stepId?: string
  ) => void;
  onReasoningBrief?: (brief: ReasoningBrief) => void;
  onMeta?: (resolvedModel: string, reason: string) => void;
  onDelta?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onStatus?: (phase: import('../chat-activity-types').ChatActivityPhase, status: 'active' | 'done', detail?: string) => void;
}

export type MultiAgentPipelineResult =
  | {
      ok: true;
      text: string;
      resolvedModel?: string;
      provider?: string;
      runId?: string;
      stageSummary?: string;
      reasoningBrief?: ReasoningBrief;
      pipelineRecapMeta?: PipelineRecapMeta;
      paused?: boolean;
      pauseReason?: 'ui-design';
      /** Raw final composer output (may differ from chat summary text) */
      composeText?: string;
      writtenFiles?: string[];
      completionGate?: import('../project-completion-gate').CompletionGateResult;
      deliveryBlocked?: boolean;
      needsReview?: boolean;
      verifyPending?: boolean;
    }
  | {
      ok: false;
      error: string;
      text?: string;
      runId?: string;
    };
