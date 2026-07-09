export type MultiAgentStageId =
  | 'memory'
  | 'integrate'
  | 'context'
  | 'orchestrator'
  | 'decompose'
  | 'subagent'
  | 'merge'
  | 'supervisor'
  | 'compose';

export type StageStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface PipelineTask {
  id: string;
  module: string;
  purpose: string;
  description: string;
  dependencies: string[];
  phase?: 'ui' | 'core';
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
  waitMessageRotateMs: 3500,
};

export interface PipelineRecapMeta {
  taskCount: number;
  fastPipeline: boolean;
  pendingIssues: string[];
  composeWaves?: number;
  devTools?: DevToolsIntegrationResult;
  supervisor?: SupervisorResult;
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
}

export const DEFAULT_FULL_DELIVERY_CONFIG: FullDeliveryConfig = {
  enabled: true,
  maxComposeWaves: 3,
  autoContinue: true,
  uiCheckpoint: true,
  minFencesPerTask: 2,
  minFencesAbsolute: 4,
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
  reasoningLayer: { ...DEFAULT_REASONING_LAYER_CONFIG },
  fullDelivery: { ...DEFAULT_FULL_DELIVERY_CONFIG },
};

export interface MultiAgentPipelineCallbacks {
  onMultiAgentStatus?: (stage: MultiAgentStageId, status: 'active' | 'done', detail?: string) => void;
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
    }
  | {
      ok: false;
      error: string;
      text?: string;
      runId?: string;
    };
