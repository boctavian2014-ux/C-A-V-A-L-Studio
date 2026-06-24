// ──────────────────────────────────────────────
//  Context Builder
//  Construiește contextul trimis la AI:
//  fișierul activ + selecție + fișiere relevante din proiect
// ──────────────────────────────────────────────

import type { AIMessage } from '../multi-model/provider';
import type { EditorTab, FileNode } from '../../src/renderer/store/editor-store';

export interface ContextOptions {
  activeTab:    EditorTab | null;
  selection?:   string;
  fileTree:     FileNode[];
  projectPath:  string | null;
  includeMode:  'file' | 'project' | 'selection';
  projectContext?: string;
  mentions?:    string[];
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

// ──────────────────────────────────────────────
//  System prompt — personalitatea Caval AI
// ──────────────────────────────────────────────

export function buildSystemPrompt(projectName: string | null): string {
  return `Ești Caval AI, asistentul de cod integrat în Caval IDE.
Proiect curent: ${projectName ?? 'necunoscut'}
Stack: TypeScript, React, Electron, Node.js

Reguli:
- Răspunzi în limba utilizatorului (română sau engleză)
- Când propui modificări de cod, folosești blocuri \`\`\`diff sau \`\`\`typescript
- Dacă modificarea afectează mai multe fișiere, le listezi explicit
- Ești concis și direct — nu repeți informații din context
- Când generezi cod, îl faci complet și rulabil, nu cu placeholder-uri
- La întrebări despre arhitectură sau design, oferi opțiuni cu trade-offs`;
}

// ──────────────────────────────────────────────
//  Construiește mesajele trimise la AI
// ──────────────────────────────────────────────

export function buildContextMessages(
  userMessage: string,
  history: AIMessage[],
  opts: ContextOptions
): AIMessage[] {
  const messages: AIMessage[] = [];
  let usedTokens = 0;

  const projectName = opts.projectPath?.split(/[/\\]/).pop() ?? null;

  // System prompt
  const systemContent = buildSystemPrompt(projectName);
  messages.push({ role: 'system', content: systemContent });
  usedTokens += estimateTokens(systemContent);

  // Context fișier activ
  if (opts.activeTab && opts.includeMode !== 'selection') {
    const fileCtx = buildFileContext(opts.activeTab, opts.selection);
    const fileTokens = estimateTokens(fileCtx);

    if (usedTokens + fileTokens < MAX_CONTEXT_TOKENS) {
      // Injectăm ca primul mesaj user (context tehnic, nu conversație)
      messages.push({
        role: 'user',
        content: fileCtx,
      });
      messages.push({
        role: 'assistant',
        content: 'Am înregistrat contextul fișierului. Ce vrei să fac?',
      });
      usedTokens += fileTokens;
    }
  }

  // Selecție specifică
  if (opts.selection && opts.includeMode === 'selection') {
    const selCtx = `Selecție din editor:\n\`\`\`${opts.activeTab?.language ?? ''}\n${opts.selection}\n\`\`\``;
    messages.push({ role: 'user', content: selCtx });
    messages.push({ role: 'assistant', content: 'Am văzut selecția. Ce vrei să fac cu ea?' });
    usedTokens += estimateTokens(selCtx);
  }

  // Context proiect (semantic search)
  if (opts.projectContext && opts.includeMode === 'project') {
    const ctx = `Context relevant din proiect:\n${opts.projectContext}`;
    if (usedTokens + estimateTokens(ctx) < MAX_CONTEXT_TOKENS) {
      messages.push({ role: 'user', content: ctx });
      messages.push({ role: 'assistant', content: 'Am analizat contextul proiectului.' });
      usedTokens += estimateTokens(ctx);
    }
  }

  // @mentions
  if (opts.mentions?.length) {
    const mentionCtx = `Fișiere menționate: ${opts.mentions.join(', ')}`;
    messages.push({ role: 'user', content: mentionCtx });
    usedTokens += estimateTokens(mentionCtx);
  }

  // Istoricul conversației
  const historyToAdd: AIMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(history[i].content);
    if (usedTokens + tokens > MAX_CONTEXT_TOKENS - 4000) break; // rezervă 4k pentru răspuns
    historyToAdd.unshift(history[i]);
    usedTokens += tokens;
  }
  messages.push(...historyToAdd);

  // Mesajul curent al utilizatorului
  messages.push({ role: 'user', content: userMessage });

  return messages;
}

// ──────────────────────────────────────────────
//  Helper: formatează contextul unui fișier
// ──────────────────────────────────────────────

function buildFileContext(tab: EditorTab, selection?: string): string {
  const lines = tab.content.split('\n');
  const totalLines = lines.length;

  let content = tab.content;

  // Dacă fișierul e foarte mare, trimitem doar primele + ultimele linii
  if (totalLines > 400) {
    const head = lines.slice(0, 150).join('\n');
    const tail = lines.slice(-100).join('\n');
    content = `${head}\n\n// ... (${totalLines - 250} linii omise) ...\n\n${tail}`;
  }

  let ctx = `Fișier activ: \`${tab.path}\`\n\`\`\`${tab.language}\n${content}\n\`\`\``;

  if (selection) {
    ctx += `\n\nSelecție curentă (liniile selectate):\n\`\`\`${tab.language}\n${selection}\n\`\`\``;
  }

  return ctx;
}
