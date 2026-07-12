import { AIClient } from '../ai-client';
import { preloadManager } from '../preload/preload-manager';
import {
  resolveModelSelection,
  getAutoFreeModelCandidates,
  getAutoBalancedModelCandidates,
  getInstalledLocalModelCandidates,
  isOllamaReachable,
} from '../models/auto-router';
import { isAutoTier, type ModelSelectionId } from '../models/model-catalog';
import { isByokModel, hasOpenRouterKey } from '../models/model-readiness';
import { getModelProfile } from '../model-profiles';
import {
  createProvider,
  type ApiKeys,
  type AIMessage,
  type ModelId,
} from '../multi-model/provider';
import type { RoutingIntent, ModelRequest } from '../types';
import type { ToolRegistry } from '../tools/tool-registry';
import { runCompletionWithTools } from './tool-agent-loop';
import type { ChatActivityPhase } from '../composer/chat-activity-types';
import { pickBestEngineeringOutput } from '../engineering/engineering-json';
import { pickCodeStreamOutput } from '../composer/scaffold-parser';
import { REASONING_CHAT_ADDON } from '../prompts/reasoning-layer';
import { MULTI_MODEL_RECAP_ADDON } from '../prompts/multi-model-reasoning-chat';

const aiClient = new AIClient();

const OLLAMA_SETUP_ERROR = [
  'Ollama nu rulează.',
  '',
  '1. Deschide aplicația Ollama (sau rulează: ollama serve)',
  '2. Instalează modelul: ollama pull qwen2.5-coder:7b',
  '3. Prima generare poate dura 15–60 secunde (modelul se încarcă în RAM)',
].join('\n');

export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteModelTextInput {
  model: ModelSelectionId;
  intent?: RoutingIntent;
  capability?: ModelRequest['capability'];
  messages: CompletionMessage[];
  workspaceRoot?: string;
  requestId?: string;
  apiKeys?: ApiKeys;
  toolRegistry?: ToolRegistry;
  useTools?: boolean;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export type CompleteModelTextResult =
  | { ok: true; text: string; resolvedModel: string; provider: string }
  | { ok: false; error: string };

export interface CompletionStreamCallbacks {
  onMeta?: (resolvedModel: string, reason: string) => void;
  onDelta?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onToolCall?: (
    toolName: string,
    status: 'start' | 'done' | 'error',
    detail?: string,
    writtenPath?: string
  ) => void;
  onStatus?: (phase: ChatActivityPhase, status: 'active' | 'done', detail?: string) => void;
}

function buildModelRequest(
  input: CompleteModelTextInput,
  modelId: string,
  requestId: string
): ModelRequest {
  const intent = input.intent ?? 'kilocode';
  const capability = input.capability ?? 'chat';
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');

  return {
    prompt: lastUser?.content ?? '',
    system: input.messages.find((m) => m.role === 'system')?.content,
    capability,
    intent,
    stream: true,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    timeoutMs: input.timeoutMs ?? (input.jsonMode ? 120_000 : undefined),
    metadata: {
      requestId,
      preferredModel: modelId,
      resolvedModel: modelId,
      selectionId: input.model,
      workspaceRoot: input.workspaceRoot,
      ...(input.jsonMode ? { responseFormat: 'json_object' as const } : {}),
    },
    messages: input.messages,
  };
}

async function streamByokModel(
  modelId: ModelId,
  apiKeys: ApiKeys,
  messages: CompletionMessage[],
  callbacks: CompletionStreamCallbacks,
  isChat = false
): Promise<CompleteModelTextResult> {
  const provider = createProvider(modelId, apiKeys);
  let full = '';
  let streamError: string | undefined;
  let gotFirstDelta = false;

  if (isChat) {
    callbacks.onStatus?.('connect', 'done');
    callbacks.onStatus?.('think', 'active');
  }

  await provider.streamChat(messages as AIMessage[], ({ delta, error }) => {
    if (error) {
      streamError = error;
      return;
    }
    if (isChat && !gotFirstDelta && delta) {
      gotFirstDelta = true;
      callbacks.onStatus?.('think', 'done');
      callbacks.onStatus?.('write', 'active');
    }
    full += delta;
    callbacks.onDelta?.(delta);
  });

  if (streamError) {
    return { ok: false, error: streamError };
  }

  callbacks.onMeta?.(modelId, 'BYOK direct');
  if (isChat) {
    callbacks.onStatus?.('write', 'done');
  }
  return { ok: true, text: full, resolvedModel: modelId, provider: 'byok' };
}

async function getModelsToTry(
  selectionId: ModelSelectionId,
  resolvedModelId: string,
  intent: RoutingIntent = 'kilocode'
): Promise<string[]> {
  let ids: string[];
  if (selectionId === 'caval-auto/free') {
    ids = await getAutoFreeModelCandidates();
  } else if (selectionId === 'caval-auto/balanced') {
    const candidates = getAutoBalancedModelCandidates(intent);
    ids = !candidates.includes(resolvedModelId)
      ? [resolvedModelId, ...candidates]
      : candidates;
  } else if (
    isAutoTier(selectionId) &&
    getModelProfile(resolvedModelId)?.provider === 'open_source'
  ) {
    const candidates = await getAutoFreeModelCandidates();
    ids = [resolvedModelId, ...candidates.filter((id) => id !== resolvedModelId)];
  } else {
    ids = [resolvedModelId];
  }

  const local = await getInstalledLocalModelCandidates();
  const seen = new Set(ids);
  for (const id of local) {
    if (!seen.has(id)) {
      ids.push(id);
      seen.add(id);
    }
  }
  return ids;
}

function formatCompletionError(
  selectionId: ModelSelectionId,
  errors: string[]
): string {
  const joined = errors.join('\n').toLowerCase();

  if (
    !hasOpenRouterKey() &&
    (isAutoTier(selectionId) || selectionId.startsWith('openrouter:'))
  ) {
    return [
      'OpenRouter neconfigurat.',
      '',
      'Panoul AI → 🔑 API Keys → adaugă cheia OpenRouter (sk-or-...).',
      'Alternativ: selectează Auto Free (Ollama local).',
    ].join('\n');
  }

  if (
    joined.includes('401') ||
    joined.includes('unauthorized') ||
    joined.includes('invalid api key')
  ) {
    return [
      'Cheie API invalidă sau expirată.',
      '',
      'Verifică OpenRouter API Key în Panoul AI → 🔑.',
      '',
      errors.join('\n'),
    ].join('\n');
  }

  if (
    joined.includes('404') ||
    joined.includes('model_not_found') ||
    joined.includes('not a valid model')
  ) {
    return [
      'Modelul nu este disponibil la furnizor.',
      '',
      errors.join('\n'),
      '',
      'Soluții rapide:',
      '• Selectează „Auto Free” în panoul AI (folosește Ollama local)',
      '• Sau: ollama pull qwen2.5-coder:7b (ai deja instalat — repornește app)',
      '• Sau: adaugă OpenRouter API Key valid (🔑 în panoul AI)',
    ].join('\n');
  }

  if (selectionId === 'caval-auto/free') {
    return [
      'Niciun model local free nu a răspuns.',
      '',
      errors.join('\n'),
      '',
      'Verifică:',
      '• Ollama rulează (ollama serve sau app deschisă)',
      '• Model instalat: ollama pull qwen2.5-coder:7b',
    ].join('\n');
  }

  return ['Modelul nu a răspuns.', '', errors.join('\n')].join('\n');
}

export async function executeModelCompletion(
  input: CompleteModelTextInput,
  callbacks: CompletionStreamCallbacks = {}
): Promise<CompleteModelTextResult> {
  const requestId = input.requestId ?? `complete-${Date.now()}`;
  const intent = input.intent ?? 'kilocode';
  const isChat = (input.capability ?? 'chat') === 'chat' || input.capability === 'code';

  if (isByokModel(input.model)) {
    if (!input.apiKeys) {
      return { ok: false, error: 'Chei API lipsă pentru modelul BYOK selectat.' };
    }
    if (isChat) {
      callbacks.onStatus?.('route', 'active');
      callbacks.onStatus?.('route', 'done', input.model);
      callbacks.onStatus?.('connect', 'active');
    }
    return streamByokModel(input.model as ModelId, input.apiKeys, input.messages, callbacks, isChat);
  }

  if (isChat) {
    callbacks.onStatus?.('route', 'active');
  }

  const resolved = await resolveModelSelection(input.model, intent);

  if (isChat) {
    callbacks.onStatus?.('route', 'done', resolved.modelId);
    callbacks.onStatus?.('connect', 'active');
  }

  if (!isChat) {
    const stage = input.capability === 'planning' ? 'composer' : 'chat';
    preloadManager.recordUsage(resolved.modelId, stage, false);
    void preloadManager.onUserAction('chat.stream', {
      selectedModel: resolved.modelId,
      intent,
      capability: input.capability ?? 'chat',
    });
  }

  if (
    !isChat &&
    input.model === 'caval-auto/free' &&
    !hasOpenRouterKey() &&
    !(await isOllamaReachable())
  ) {
    return { ok: false, error: OLLAMA_SETUP_ERROR };
  }

  if (
    (input.model === 'caval-auto/balanced' ||
      input.model === 'caval-auto/frontier' ||
      input.model.startsWith('openrouter:')) &&
    !hasOpenRouterKey()
  ) {
    return {
      ok: false,
      error: [
        'OpenRouter neconfigurat.',
        '',
        'Panoul AI → 🔑 API Keys → adaugă cheia OpenRouter (sk-or-...).',
        'Alternativ: selectează Auto Free (Ollama local).',
      ].join('\n'),
    };
  }

  if (input.model === 'caval-auto/free' && !hasOpenRouterKey() && !(await isOllamaReachable())) {
    return { ok: false, error: OLLAMA_SETUP_ERROR };
  }

  const needsModelFallback =
    input.capability === 'code' ||
    input.capability === 'planning' ||
    input.capability === 'debug' ||
    !isChat;

  const modelIdsToTry = needsModelFallback
    ? (await getModelsToTry(input.model, resolved.modelId, intent)).slice(
        0,
        input.jsonMode ? 6 : 5
      )
    : [resolved.modelId];
  const errors: string[] = [];

  for (const modelId of modelIdsToTry) {
    if (isChat) {
      callbacks.onMeta?.(modelId, resolved.reason);
    } else {
      callbacks.onMeta?.(modelId, `Încerc model: ${modelId}`);
    }

    try {
      const modelRequest = buildModelRequest(input, modelId, requestId);

      if (input.useTools !== false && input.toolRegistry && input.capability !== 'code') {
        try {
          const toolResult = await runCompletionWithTools({
            aiClient,
            registry: input.toolRegistry,
            baseRequest: modelRequest,
            initialMessages: input.messages,
            modelId,
            callbacks,
          });

          if (toolResult.ok) {
            const profile = getModelProfile(modelId);
            return {
              ok: true,
              text: toolResult.text,
              resolvedModel: modelId,
              provider: profile?.provider ?? 'open_source',
            };
          }

          errors.push(`${modelId}: ${toolResult.error}`);
        } catch (err) {
          errors.push(`${modelId}: ${err instanceof Error ? err.message : String(err)}`);
        }
        // Fall through: stream without tools (code blocks)
      }

      const streamMessages =
        input.capability === 'code'
          ? input.messages.map((m) =>
              m.role === 'system'
                ? {
                    ...m,
                    content: `${m.content}\n\nEMIT NOW (Balanced Mode): output every file as fenced blocks \`\`\`lang:relative/path\`\`\` with FULL runnable source. Include README.md, docs/, tests, CI/CD when relevant.${REASONING_CHAT_ADDON} No list_dir-only.`,
                  }
                : m
            )
          : input.messages.map((m) =>
              m.role === 'system'
                ? { ...m, content: `${m.content}${MULTI_MODEL_RECAP_ADDON}` }
                : m
            );

      const streamRequest = { ...modelRequest, messages: streamMessages };

      let full = '';
      let reasoningFull = '';
      let gotFirstContent = false;
      let gotReasoning = false;

      if (isChat) {
        callbacks.onStatus?.('connect', 'done');
        callbacks.onStatus?.('think', 'active');
      }

      for await (const chunk of aiClient.stream(streamRequest)) {
        if (chunk.kind === 'reasoning') {
          reasoningFull += chunk.text;
          if (!gotReasoning && isChat) {
            gotReasoning = true;
            callbacks.onStatus?.('think', 'active');
          }
          callbacks.onReasoning?.(chunk.text);
          continue;
        }

        if (isChat && !gotFirstContent && chunk.text) {
          gotFirstContent = true;
          callbacks.onStatus?.('think', 'done');
          callbacks.onStatus?.('write', 'active');
        }
        full += chunk.text;
        callbacks.onDelta?.(chunk.text);
      }

      if (isChat) {
        callbacks.onStatus?.('write', 'done');
      }

      const profile = getModelProfile(modelId);
      let text = input.jsonMode
        ? pickBestEngineeringOutput(full, reasoningFull)
        : full;
      if (input.capability === 'code' && !input.jsonMode) {
        text = pickCodeStreamOutput(full, reasoningFull);
      }
      return {
        ok: true,
        text,
        resolvedModel: modelId,
        provider: profile?.provider ?? 'open_source',
      };
    } catch (error) {
      errors.push(`${modelId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    ok: false,
    error: formatCompletionError(input.model, errors),
  };
}

export async function completeModelText(
  input: CompleteModelTextInput
): Promise<CompleteModelTextResult> {
  return executeModelCompletion(input);
}
