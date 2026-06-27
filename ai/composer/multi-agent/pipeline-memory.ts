import fs from 'node:fs';
import path from 'node:path';

import type { PipelineContext, PipelineTask, SupervisorResult } from './types';

export interface PipelineRunMemory {
  runId: string;
  userMessage: string;
  timestamp: number;
  taskCount: number;
  taskModules: string[];
  supervisorSummary?: string;
  approved?: boolean;
}

export interface PipelineMemoryRecord {
  version: 1;
  projectPath: string;
  updatedAt: number;
  runs: PipelineRunMemory[];
  lastUserIntent?: string;
  lastArchitecture?: string;
  preferences: Record<string, string>;
}

const MAX_RUNS = 20;

function memoryDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.cavalo', 'memory');
}

function memoryPath(workspaceRoot: string): string {
  return path.join(memoryDir(workspaceRoot), 'global.json');
}

export class PipelineMemoryEngine {
  private record: PipelineMemoryRecord;

  private constructor(record: PipelineMemoryRecord) {
    this.record = record;
  }

  static load(workspaceRoot: string): PipelineMemoryEngine {
    const filePath = memoryPath(workspaceRoot);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as PipelineMemoryRecord;
        if (parsed.version === 1) {
          return new PipelineMemoryEngine(parsed);
        }
      }
    } catch {
      // fresh memory
    }
    return new PipelineMemoryEngine({
      version: 1,
      projectPath: workspaceRoot,
      updatedAt: Date.now(),
      runs: [],
      preferences: {},
    });
  }

  save(workspaceRoot: string): void {
    this.record.updatedAt = Date.now();
    this.record.projectPath = workspaceRoot;
    const dir = memoryDir(workspaceRoot);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(memoryPath(workspaceRoot), JSON.stringify(this.record, null, 2));
  }

  enrichContext(context: PipelineContext): PipelineContext {
    const lastRun = this.record.runs[this.record.runs.length - 1];
    const hints: string[] = [];
    if (this.record.lastUserIntent) {
      hints.push(`Previous intent: ${this.record.lastUserIntent}`);
    }
    if (this.record.lastArchitecture) {
      hints.push(`Previous architecture: ${this.record.lastArchitecture.slice(0, 500)}`);
    }
    if (lastRun) {
      hints.push(`Last run (${lastRun.runId}): ${lastRun.taskCount} tasks — ${lastRun.taskModules.join(', ')}`);
    }
    if (hints.length === 0) return context;

    return {
      ...context,
      architectureContext: [context.architectureContext, ...hints].filter(Boolean).join('\n'),
      pendingIssues: [...context.pendingIssues],
    };
  }

  syncFromContext(context: PipelineContext): void {
    this.record.lastUserIntent = context.userIntent;
    if (context.architectureContext) {
      this.record.lastArchitecture = context.architectureContext.slice(0, 4000);
    }
  }

  syncFromDecomposition(tasks: PipelineTask[], raw: string): void {
    if (raw.length > 100) {
      this.record.lastArchitecture = raw.slice(0, 4000);
    }
    void tasks;
  }

  recordRun(input: {
    runId: string;
    userMessage: string;
    tasks: PipelineTask[];
    supervisor?: SupervisorResult;
  }): void {
    const entry: PipelineRunMemory = {
      runId: input.runId,
      userMessage: input.userMessage.slice(0, 500),
      timestamp: Date.now(),
      taskCount: input.tasks.length,
      taskModules: input.tasks.map((t) => t.module),
      supervisorSummary: input.supervisor?.summary,
      approved: input.supervisor?.approved,
    };
    this.record.runs.push(entry);
    if (this.record.runs.length > MAX_RUNS) {
      this.record.runs = this.record.runs.slice(-MAX_RUNS);
    }
    this.record.lastUserIntent = input.userMessage.slice(0, 500);
  }

  getRecentRuns(limit = 5): PipelineRunMemory[] {
    return this.record.runs.slice(-limit);
  }

  toJSON(): PipelineMemoryRecord {
    return { ...this.record, runs: [...this.record.runs] };
  }
}
