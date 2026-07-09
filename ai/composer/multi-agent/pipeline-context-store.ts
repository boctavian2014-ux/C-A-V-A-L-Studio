import type { MultiAgentStageId, PipelineContext, PipelineTask } from './types';

function extractSection(raw: string, heading: string): string {
  const re = new RegExp(
    `\\*\\*${heading}:\\*\\*\\s*([\\s\\S]*?)(?=\\n- \\*\\*|\\n\\*\\*|$)`,
    'i'
  );
  const m = raw.match(re);
  return m?.[1]?.trim() ?? '';
}

function extractBulletList(raw: string, heading: string): string[] {
  const section = extractSection(raw, heading);
  if (!section) return [];
  return section
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

export function parseContextAgentOutput(raw: string, userMessage: string): PipelineContext {
  return {
    userIntent: extractSection(raw, 'User Intent Summary') || userMessage.slice(0, 500),
    normalizedRequirements:
      extractSection(raw, 'Normalized Requirements') || userMessage,
    functionalRequirements: extractBulletList(raw, 'Functional Requirements'),
    nonFunctionalRequirements: extractBulletList(raw, 'Non-Functional Requirements'),
    platformConstraints: extractBulletList(raw, 'Platform Constraints'),
    storeCompliance: extractBulletList(raw, 'Store Compliance Requirements'),
    architectureContext: extractSection(raw, 'Architecture Context'),
    moduleContext: extractSection(raw, 'Module Context'),
    interfaceContext: extractSection(raw, 'Interface Context'),
    dependencyMap: extractSection(raw, 'Dependency Map'),
    pendingIssues: extractBulletList(raw, 'Pending Issues'),
  };
}

export function buildFallbackContext(userMessage: string, projectContext?: string): PipelineContext {
  return {
    userIntent: userMessage.slice(0, 500),
    normalizedRequirements: projectContext
      ? `${userMessage}\n\nProject context:\n${projectContext.slice(0, 8000)}`
      : userMessage,
    functionalRequirements: [],
    nonFunctionalRequirements: ['Production-ready code', 'Error handling', 'Maintainability'],
    platformConstraints: [],
    storeCompliance: [],
    architectureContext: '',
    moduleContext: '',
    interfaceContext: '',
    dependencyMap: '',
    pendingIssues: [],
  };
}

export type ContextBuildStage = MultiAgentStageId | 'subagent-task';

export class PipelineContextStore {
  private context: PipelineContext;
  private tasks: PipelineTask[] = [];
  private decompositionRaw = '';
  private mergeRaw = '';
  private subAgentOutputs: Map<string, string> = new Map();

  private constructor(context: PipelineContext) {
    this.context = context;
  }

  static createFallback(userMessage: string, projectContext?: string): PipelineContextStore {
    return new PipelineContextStore(buildFallbackContext(userMessage, projectContext));
  }

  static fromAgentOutput(raw: string, userMessage: string, projectContext?: string): PipelineContextStore {
    const parsed = parseContextAgentOutput(raw, userMessage);
    if (!parsed.normalizedRequirements.trim()) {
      return PipelineContextStore.createFallback(userMessage, projectContext);
    }
    if (projectContext && !parsed.architectureContext) {
      parsed.architectureContext = projectContext.slice(0, 4000);
    }
    return new PipelineContextStore(parsed);
  }

  getContext(): PipelineContext {
    return { ...this.context };
  }

  setContext(context: PipelineContext): void {
    this.context = { ...context };
  }

  getTasks(): PipelineTask[] {
    return [...this.tasks];
  }

  setTasks(tasks: PipelineTask[]): void {
    this.tasks = tasks;
  }

  setDecompositionRaw(raw: string): void {
    this.decompositionRaw = raw;
  }

  setMergeRaw(raw: string): void {
    this.mergeRaw = raw;
  }

  setSubAgentOutput(taskId: string, output: string): void {
    this.subAgentOutputs.set(taskId, output);
  }

  getSubAgentOutput(taskId: string): string | undefined {
    return this.subAgentOutputs.get(taskId);
  }

  getMergeRaw(): string {
    return this.mergeRaw;
  }

  exportSnapshot(): {
    context: PipelineContext;
    tasks: PipelineTask[];
    decompositionRaw: string;
    mergeRaw: string;
    subAgentOutputs: Record<string, string>;
  } {
    return {
      context: this.getContext(),
      tasks: this.getTasks(),
      decompositionRaw: this.decompositionRaw,
      mergeRaw: this.mergeRaw,
      subAgentOutputs: Object.fromEntries(this.subAgentOutputs),
    };
  }

  static fromSnapshot(snapshot: {
    context: PipelineContext;
    tasks?: PipelineTask[];
    decompositionRaw?: string;
    mergeRaw?: string;
    subAgentOutputs?: Record<string, string>;
  }): PipelineContextStore {
    const store = new PipelineContextStore({ ...snapshot.context });
    if (snapshot.tasks) store.setTasks(snapshot.tasks);
    if (snapshot.decompositionRaw) store.setDecompositionRaw(snapshot.decompositionRaw);
    if (snapshot.mergeRaw) store.setMergeRaw(snapshot.mergeRaw);
    for (const [id, out] of Object.entries(snapshot.subAgentOutputs ?? {})) {
      store.setSubAgentOutput(id, out);
    }
    return store;
  }

  applyUiPreferences(prefs: string): void {
    const block = `\n\n## UI Design Preferences (user)\n${prefs.trim()}`;
    this.context.interfaceContext = (this.context.interfaceContext ?? '') + block;
    this.context.normalizedRequirements += block;
  }

  addPendingIssues(issues: string[]): void {
    this.context.pendingIssues = [...new Set([...this.context.pendingIssues, ...issues])];
  }

  setSupervisorIssues(issues: string[]): void {
    this.addPendingIssues(issues);
  }

  buildPromptFor(stage: ContextBuildStage, task?: PipelineTask): string {
    const ctx = this.context;
    const sections: string[] = [
      `## User Intent\n${ctx.userIntent}`,
      `## Normalized Requirements\n${ctx.normalizedRequirements}`,
    ];

    if (ctx.functionalRequirements.length) {
      sections.push(`## Functional Requirements\n${ctx.functionalRequirements.map((r) => `- ${r}`).join('\n')}`);
    }
    if (ctx.nonFunctionalRequirements.length) {
      sections.push(
        `## Non-Functional Requirements\n${ctx.nonFunctionalRequirements.map((r) => `- ${r}`).join('\n')}`
      );
    }
    if (ctx.platformConstraints.length) {
      sections.push(`## Platform Constraints\n${ctx.platformConstraints.map((r) => `- ${r}`).join('\n')}`);
    }
    if (ctx.storeCompliance.length) {
      sections.push(`## Store Compliance\n${ctx.storeCompliance.map((r) => `- ${r}`).join('\n')}`);
    }
    if (ctx.architectureContext) {
      sections.push(`## Architecture Context\n${ctx.architectureContext}`);
    }
    if (ctx.interfaceContext) {
      sections.push(`## Interface Context\n${ctx.interfaceContext}`);
    }
    if (ctx.dependencyMap) {
      sections.push(`## Dependency Map\n${ctx.dependencyMap}`);
    }
    if (ctx.pendingIssues.length) {
      sections.push(`## Pending Issues\n${ctx.pendingIssues.map((r) => `- ${r}`).join('\n')}`);
    }

    if (stage === 'decompose') {
      return sections.join('\n\n');
    }

    if (stage === 'subagent-task' && task) {
      sections.push(
        `## Assigned Task\n- Module: ${task.module}\n- Purpose: ${task.purpose}\n- Task: ${task.description}`
      );
      if (task.dependencies.length) {
        sections.push(`## Task Dependencies\n${task.dependencies.map((d) => `- ${d}`).join('\n')}`);
      }
      return sections.join('\n\n');
    }

    if (stage === 'merge') {
      sections.push(`## Decomposition\n${this.decompositionRaw.slice(0, 12000)}`);
      const subParts: string[] = [];
      for (const t of this.tasks) {
        const out = this.subAgentOutputs.get(t.id);
        if (out) {
          subParts.push(`### Sub-Agent: ${t.module} (${t.id})\n${out.slice(0, 8000)}`);
        }
      }
      sections.push(`## Sub-Agent Outputs\n${subParts.join('\n\n')}`);
      return sections.join('\n\n');
    }

    if (stage === 'supervisor') {
      sections.push(`## Merged Project\n${this.mergeRaw.slice(0, 16000)}`);
      return sections.join('\n\n');
    }

    if (stage === 'compose') {
      sections.push(`## Merged Architecture\n${this.mergeRaw.slice(0, 12000)}`);
      if (this.decompositionRaw) {
        sections.push(`## Original Decomposition\n${this.decompositionRaw.slice(0, 8000)}`);
      }
      const subParts: string[] = [];
      for (const t of this.tasks) {
        const out = this.subAgentOutputs.get(t.id);
        if (out) {
          subParts.push(`### Sub-Agent: ${t.module} (${t.id})\n${out.slice(0, 10_000)}`);
        }
      }
      if (subParts.length) {
        sections.push(`## Sub-Agent Outputs (implement ALL)\n${subParts.join('\n\n')}`);
      }
      return sections.join('\n\n');
    }

    return sections.join('\n\n');
  }

  toJSON(): Record<string, unknown> {
    return {
      context: this.context,
      tasks: this.tasks,
      subAgentOutputs: Object.fromEntries(this.subAgentOutputs),
      decompositionRaw: this.decompositionRaw.slice(0, 20000),
      mergeRaw: this.mergeRaw.slice(0, 20000),
    };
  }
}
