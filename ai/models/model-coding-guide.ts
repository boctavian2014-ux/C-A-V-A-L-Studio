/**
 * Per-model coding requirements for chat — what the user must configure.
 */
import type { ModelSelectionId } from './model-catalog';
import { isAutoTier } from './model-catalog';
import { isByokModel } from './model-readiness';
import { getModelProfile } from '../model-profiles';
import { MODELS } from '../multi-model/provider';

export type ModelCodingPath = 'fences' | 'tools' | 'agentic-pipeline';

export interface ModelCodingGuide {
  canCode: boolean;
  path: ModelCodingPath;
  requirement: string;
  hint: string;
}

export function getModelCodingGuide(
  modelId: ModelSelectionId,
  agentMode: string
): ModelCodingGuide {
  if (agentMode === 'agentic') {
    return {
      canCode: true,
      path: 'agentic-pipeline',
      requirement: 'Folder proiect deschis + OpenRouter sau Ollama',
      hint: 'Mod Agentic livrează proiectul via pipeline multi-agent.',
    };
  }

  if (agentMode === 'ask') {
    return {
      canCode: false,
      path: 'fences',
      requirement: 'Mod Ask — fără scriere fișiere',
      hint: 'Schimbă pe Code, Debug sau Agentic pentru cod în workspace.',
    };
  }

  if (agentMode === 'plan' || agentMode === 'architect') {
    return {
      canCode: false,
      path: 'fences',
      requirement: 'Mod Plan — doar planificare',
      hint: 'Pentru fișiere: Code, Debug sau Agentic. Poți adăuga SCAFFOLD în prompt.',
    };
  }

  // code | debug
  if (isByokModel(modelId)) {
    const meta = MODELS.find((m) => m.id === modelId);
    const provider = meta?.provider ?? 'provider';
    if (modelId === 'ollama-local') {
      return {
        canCode: true,
        path: 'fences',
        requirement: 'Ollama pornit (ollama serve)',
        hint: 'Emite ```lang:path``` — parseScaffoldFiles scrie în workspace.',
      };
    }
    return {
      canCode: true,
      path: 'fences',
      requirement: `Cheie API ${provider} în panoul 🔑`,
      hint: 'BYOK: cod via fence-uri ```ts:src/file.ts```.',
    };
  }

  if (modelId === 'caval-auto/free') {
    return {
      canCode: true,
      path: 'fences',
      requirement: 'Ollama + model coder (ollama pull qwen2.5-coder:7b)',
      hint: 'Auto Free routează local — folosește fence-uri cu path.',
    };
  }

  if (isAutoTier(modelId)) {
    return {
      canCode: true,
      path: 'tools',
      requirement: 'OpenRouter API Key (🔑) sau Ollama pentru fallback',
      hint: 'Auto routează modelul — tools sau fence-uri după model rezolvat.',
    };
  }

  const profile = getModelProfile(modelId);
  if (profile?.supportsToolCalling) {
    return {
      canCode: true,
      path: 'tools',
      requirement: 'OpenRouter API Key în panoul 🔑',
      hint: 'Model cu tools — write_file + fence-uri ca fallback.',
    };
  }

  return {
    canCode: true,
    path: 'fences',
    requirement: profile ? 'OpenRouter API Key (🔑)' : 'OpenRouter API Key (🔑)',
    hint: 'Cod via ```lang:relative/path``` — obligatoriu path în header.',
  };
}

export function modeSupportsFileApply(agentMode: string): boolean {
  return agentMode === 'code' || agentMode === 'agentic' || agentMode === 'debug';
}
