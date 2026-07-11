// ──────────────────────────────────────────────
//  Context Builder
//  Construiește contextul trimis la AI:
//  fișierul activ + selecție + fișiere relevante din proiect
// ──────────────────────────────────────────────

import type { AIMessage } from '../multi-model/provider';
import type { EditorTab, FileNode } from '../../src/renderer/store/editor-store';
import { CODING_ARENA_SYSTEM_PROMPT } from '../prompts/coding-arena';
import {
  buildMultiModelSystemPrompt,
  MULTI_MODEL_RECAP_ADDON,
} from '../prompts/multi-model-reasoning-chat';
import { SCAFFOLD_EMISSION_RULE } from '../prompts/scaffold-emission-rule';
import { CAVALO_BUILD_ENGINE_PROMPT } from '../prompts/cavalo-build-engine';

export interface ContextOptions {
  activeTab:    EditorTab | null;
  selection?:   string;
  fileTree:     FileNode[];
  projectPath:  string | null;
  includeMode:  'file' | 'project' | 'selection';
  projectContext?: string;
  mentions?:    string[];
  mentionFiles?: Array<{ path: string; name: string; content: string }>;
  attachments?: Array<{ path: string; name: string; content: string }>;
  /** Nu atașa fișierul activ (întrebări generale fără legătură cu codul deschis) */
  skipActiveFile?: boolean;
  agentMode?: 'ask' | 'plan' | 'code' | 'build' | 'agentic' | 'debug';
  /** Hint from last Build run (.cavalo/memory) */
  buildMemoryHint?: string;
}

// Token estimator simplu (1 token ≈ 4 caractere)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const MAX_CONTEXT_TOKENS = 60_000; // limită sigură pentru orice model

/** Extrage @mentions din mesajul utilizatorului */
export function parseMentions(text: string): string[] {
  const matches = text.match(/@([\w./\\-]+)/g) ?? [];
  return matches.map((m) => m.slice(1));
}

/** Rezumat compact al structurii proiectului pentru context fallback */
export function buildProjectTreeSummary(nodes: FileNode[], maxItems = 40): string {
  const lines: string[] = [];

  const walk = (items: FileNode[], depth = 0): void => {
    for (const node of items) {
      if (lines.length >= maxItems) return;
      const indent = '  '.repeat(depth);
      const icon = node.type === 'directory' ? '📁' : '📄';
      lines.push(`${indent}${icon} ${node.name}`);
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };

  walk(nodes);
  if (lines.length >= maxItems) {
    lines.push('...(structură trunchiată)');
  }
  return lines.join('\n');
}

// ──────────────────────────────────────────────
//  System prompt — personalitatea Caval AI
// ──────────────────────────────────────────────

export function buildLiteSystemPrompt(agentMode?: ContextOptions['agentMode']): string {
  return `${buildMultiModelSystemPrompt({ agentMode })}${MULTI_MODEL_RECAP_ADDON}`;
}

/** Minimal payload for general chat — target TTFT ~3s */
export function buildFastChatMessages(
  userMessage: string,
  history: AIMessage[] = [],
  agentMode?: ContextOptions['agentMode']
): AIMessage[] {
  const system =
    agentMode === 'agentic'
      ? CODING_ARENA_SYSTEM_PROMPT
      : buildLiteSystemPrompt(agentMode);
  const msgs: AIMessage[] = [{ role: 'system', content: system }];
  for (const m of history.slice(-2)) {
    if (m.role === 'user' || m.role === 'assistant') {
      msgs.push({ role: m.role, content: m.content.slice(0, 600) });
    }
  }
  msgs.push({ role: 'user', content: userMessage });
  return msgs;
}

export function buildSystemPrompt(projectName: string | null, projectPath?: string | null): string {
  const pathLine = projectPath ? `\nCale proiect: ${projectPath}` : '';
  return `Ești Caval AI, asistentul de cod integrat în Caval IDE (CAVALO).
Proiect curent: ${projectName ?? 'necunoscut'}${pathLine}
Stack principal IDE: TypeScript, React, Electron, Node.js

Ce există REAL în Caval (nu inventa alte funcții):
- Chat + editare cod în workspace-ul deschis
- Git (GitPanel), terminal, MCP opțional
- Mobile: suport Expo/EAS (detectare app.json, build Android/iOS via \`mobile/mobile-build-service.ts\`) — NU există wizard React Native / Flutter / Ionic integrat
- Engineering/CAD separat de chat-ul obișnuit

Context automat:
- Primești fișierul activ din editor și structura proiectului.
- „acest cod” = fișierul activ din mesaj.
- Nu cere cod deja furnizat.

Reguli de răspuns:
- Limba utilizatorului (română sau engleză)
- Întrebări scurte („în 30 sec”, „rapid”) → comenzi concrete + pași numerotați (max 5), FĂRĂ meniuri cu 3 opțiuni vagi
- Nu lista capabilități generice dacă utilizatorul vrea acțiune — execută mental task-ul: comenzi terminal, fișiere de creat, cod minimal
- Nu hallucina template-uri, panouri sau feature-uri inexistente
- Cereri de arhitectură software / ML / API: generează cod și fișiere, nu refuza
- Cod complet și rulabil; fișiere noi ca \`\`\`typescript:src/cale/fisier.ts\`\`\` (path relativ în header)
- Concis: fără introducere lungă, fără repetarea contextului

Mobile app rapid (când întreabă):
1. \`npx create-expo-app@latest NumeleApp --template blank\`
2. \`cd NumeleApp && npx expo start\`
3. Pentru build store: cont Expo + \`npx eas build --platform android|ios\` (după \`eas.json\`)`;
}

// ──────────────────────────────────────────────
//  Construiește mesajele trimise la AI
// ──────────────────────────────────────────────

/** Întrebări generale (mobile app, cum fac X) — fără index / arbore proiect */
export function shouldAttachProjectContext(
  userMessage: string,
  includeMode: ContextOptions['includeMode'],
  opts?: { hasMentions?: boolean; hasAttachments?: boolean; hasProjectPath?: boolean }
): boolean {
  // Folder deschis → context proiect mereu (indiferent de includeMode vechi din localStorage)
  if (opts?.hasProjectPath && includeMode !== 'selection') return true;
  if (includeMode !== 'project') return false;
  if (opts?.hasMentions || opts?.hasAttachments) return true;
  if (parseMentions(userMessage).length > 0) return true;

  const t = userMessage.trim();
  if (t.length < 200) {
    const codeHints =
      /\b(bug|fix|refactor|funcție|function|class|import|fișier|file|cod|code|eroare|error|test|component|hook|api|diff|commit|enterprise|audit|verific|docker|package\.json|readme|proiect|folder|structură|structura|workspace|deploy|ci\/cd)\b/i;
    const pathHints = /[@/\\]|\.(ts|tsx|js|jsx|py|go|rs|json|md|yml|yaml)\b/i;
    if (!codeHints.test(t) && !pathHints.test(t)) return false;
  }
  return true;
}

export function buildContextMessages(
  userMessage: string,
  history: AIMessage[],
  opts: ContextOptions
): AIMessage[] {
  const messages: AIMessage[] = [];
  let usedTokens = 0;

  const projectName = opts.projectPath?.split(/[/\\]/).pop() ?? null;

  const attachProject = shouldAttachProjectContext(userMessage, opts.includeMode, {
    hasMentions: Boolean(opts.mentions?.length),
    hasAttachments: Boolean(opts.attachments?.length),
    hasProjectPath: Boolean(opts.projectPath),
  });

  const systemContent =
    opts.agentMode === 'agentic'
      ? `${CODING_ARENA_SYSTEM_PROMPT}${opts.projectPath ? `\n\nWorkspace activ: ${opts.projectPath}` : ''}`
      : opts.agentMode === 'build' && opts.projectPath
        ? `${CAVALO_BUILD_ENGINE_PROMPT}\n\nWorkspace activ: ${opts.projectPath}`
        : opts.agentMode === 'debug' && opts.projectPath
        ? `${buildLiteSystemPrompt(opts.agentMode)}${MULTI_MODEL_RECAP_ADDON}\n\nFocus: debug errors and apply fixes as \`\`\`lang:path\`\`\` fences.\n${SCAFFOLD_EMISSION_RULE}`
        : attachProject
        ? `${buildMultiModelSystemPrompt({ agentMode: opts.agentMode, workspacePath: opts.projectPath })}${MULTI_MODEL_RECAP_ADDON}\n\n${buildSystemPrompt(projectName, opts.projectPath)}`
        : buildLiteSystemPrompt(opts.agentMode);
  messages.push({ role: 'system', content: systemContent });
  usedTokens += estimateTokens(systemContent);

  const contextParts: string[] = [];

  if (attachProject) {
    if (opts.fileTree.length > 0) {
      contextParts.push(`Structura proiectului:\n${buildProjectTreeSummary(opts.fileTree)}`);
    }
    if (opts.buildMemoryHint) {
      contextParts.push(`Build memory:\n${opts.buildMemoryHint}`);
    }
    if (opts.projectContext) {
      contextParts.push(`Fragmente relevante:\n${opts.projectContext}`);
    }
  }

  if (opts.mentionFiles?.length) {
    const blocks = opts.mentionFiles.map(
      (file) => `Fișier @${file.name} (\`${file.path}\`):\n\`\`\`\n${file.content.slice(0, 8_000)}\n\`\`\``
    );
    contextParts.push(`Fișiere menționate:\n${blocks.join('\n\n---\n\n')}`);
  } else if (opts.mentions?.length) {
    contextParts.push(`Fișiere menționate: ${opts.mentions.join(', ')}`);
  }

  if (opts.attachments?.length) {
    const blocks = opts.attachments.map(
      (file) => `Atașament \`${file.path}\`:\n\`\`\`\n${file.content.slice(0, 24_000)}\n\`\`\``
    );
    contextParts.push(`Fișiere atașate:\n${blocks.join('\n\n---\n\n')}`);
  }

  if (contextParts.length > 0) {
    const block = contextParts.join('\n\n---\n\n');
    if (usedTokens + estimateTokens(block) < MAX_CONTEXT_TOKENS) {
      messages.push({ role: 'user', content: `Context proiect (automat):\n${block}` });
      usedTokens += estimateTokens(block);
    }
  }

  if (opts.selection && opts.includeMode === 'selection' && opts.activeTab) {
    const selCtx = `Selecție din \`${opts.activeTab.path}\`:\n\`\`\`${opts.activeTab.language ?? ''}\n${opts.selection}\n\`\`\``;
    messages.push({ role: 'user', content: selCtx });
    usedTokens += estimateTokens(selCtx);
  }

  const historyToAdd: AIMessage[] = [];
  const historyLimit = attachProject ? 8 : 4;
  const recentHistory = history.slice(-historyLimit);
  for (let i = recentHistory.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(recentHistory[i].content);
    if (usedTokens + tokens > MAX_CONTEXT_TOKENS - 4000) break;
    historyToAdd.unshift(recentHistory[i]);
    usedTokens += tokens;
  }
  messages.push(...historyToAdd);

  const finalUserMessage = buildFinalUserMessage(
    userMessage,
    opts.activeTab,
    opts.includeMode,
    opts.selection,
    opts.skipActiveFile
  );
  messages.push({ role: 'user', content: finalUserMessage });

  return messages;
}

// ──────────────────────────────────────────────
//  Helper: formatează contextul unui fișier
// ──────────────────────────────────────────────

function truncateFileContent(content: string, maxLines = 120): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  const head = lines.slice(0, 150).join('\n');
  const tail = lines.slice(-100).join('\n');
  return `${head}\n\n// ... (${lines.length - 250} linii omise) ...\n\n${tail}`;
}

/** Mesajul final include întotdeauna fișierul activ — modele mici (Ollama) citesc ultimul user msg */
export function buildFinalUserMessage(
  userMessage: string,
  activeTab: EditorTab | null,
  includeMode: ContextOptions['includeMode'],
  selection?: string,
  skipActiveFile?: boolean
): string {
  if (includeMode === 'selection' && selection) {
    return userMessage;
  }
  if (skipActiveFile || !activeTab?.content?.trim()) {
    return userMessage;
  }

  const content = truncateFileContent(activeTab.content);
  let block = `Cod din fișierul activ \`${activeTab.path}\`:\n\`\`\`${activeTab.language}\n${content}\n\`\`\``;
  if (selection?.trim()) {
    block += `\n\nSelecție curentă:\n\`\`\`${activeTab.language}\n${selection}\n\`\`\``;
  }
  return `${userMessage}\n\n---\n${block}`;
}

/** Normalizează rezultatele context-search IPC (chunk wrapper sau flat) */
export function formatContextSearchResults(
  results: Array<Record<string, unknown>>
): string {
  return results
    .map((r) => {
      const chunk = r.chunk as { path?: string; text?: string } | undefined;
      const path = chunk?.path ?? (r.path as string | undefined) ?? 'unknown';
      const text =
        chunk?.text ??
        (r.snippet as string | undefined) ??
        (r.content as string | undefined) ??
        '';
      return `File: ${path}\n${text}`;
    })
    .join('\n\n---\n\n');
}

/** Rezolvă @mentions la conținut fișier (max 6 fișiere) */
export async function resolveMentionFiles(
  mentions: string[],
  projectPath: string | null,
  readFile: (path: string) => Promise<{ ok: boolean; content?: string }>
): Promise<Array<{ path: string; name: string; content: string }>> {
  if (!projectPath || mentions.length === 0) return [];

  const sep = projectPath.includes('\\') ? '\\' : '/';
  const resolved: Array<{ path: string; name: string; content: string }> = [];

  for (const mention of mentions.slice(0, 6)) {
    const candidates = [
      mention,
      `${projectPath}${sep}${mention.replace(/\//g, sep)}`,
    ];
    for (const candidate of candidates) {
      const res = await readFile(candidate);
      if (res.ok && res.content) {
        resolved.push({
          path: candidate,
          name: mention,
          content: res.content.slice(0, 8_000),
        });
        break;
      }
    }
  }

  return resolved;
}
