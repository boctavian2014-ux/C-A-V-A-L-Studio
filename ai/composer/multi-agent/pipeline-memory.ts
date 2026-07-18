import fs from 'node:fs';
import path from 'node:path';

import type { PipelineContext, PipelineTask, SupervisorResult } from './types';
import type { FashionProjectArchetype } from '../../scaffolds/fashion-matching/archetype';
import type { CompletionGateIssue } from '../completion-gate-types';

export interface PipelineFailureMemory {
  runId: string;
  timestamp: number;
  issues: CompletionGateIssue[];
  archetype?: FashionProjectArchetype;
  userMessage?: string;
}

export interface RecoveryPattern {
  pattern: string;
  fix: string;
}

export const DEFAULT_RECOVERY_PATTERNS: RecoveryPattern[] = [
  {
    pattern: 'junk zero-latency in user workspace',
    fix: 'Delete src/zero-latency/, restore package.json name to project (not zero-latency-composer), use fashion-fullstack archetype.',
  },
  {
    pattern: 'placeholder spam files',
    fix: 'Delete src/fileN.txt and src/main_N.sh placeholders; emit only real modules from architect plan.',
  },
  {
    pattern: 'TS2307 cannot find module ../types',
    fix: 'Create web/src/types.ts with ImageUpload, MatchResult, Product, Outfit, ApiError exports; align component imports.',
  },
  {
    pattern: 'fashion project missing web/mobile',
    fix: 'Seed web/ (Vite React upload UI) and mobile/ (Expo standalone) with fashion-matching-engine API routes.',
  },
];

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
  lastBuild?: {
    timestamp: number;
    files: string[];
    scanSummary: string;
  };
  lastArena?: {
    timestamp: number;
    roleCounts: Record<string, number>;
    files: string[];
    userSimSummary?: string;
    securitySummary?: string;
    performanceSummary?: string;
    scanSummary: string;
  };
  lastFailure?: PipelineFailureMemory;
  recoveryPatterns?: RecoveryPattern[];
  projectArchetype?: FashionProjectArchetype;
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
      recoveryPatterns: [...DEFAULT_RECOVERY_PATTERNS],
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
    if (this.record.lastBuild) {
      hints.push(`Last build: ${this.record.lastBuild.scanSummary}`);
    }
    if (this.record.lastFailure) {
      const lf = this.record.lastFailure;
      const issueSummary = lf.issues
        .slice(0, 3)
        .map((i) => i.message)
        .join('; ');
      hints.push(
        `Previous failure (${lf.runId}): ${issueSummary}. Use archetype ${lf.archetype ?? 'n/a'} — never Cavallo-internal paths in user workspace.`
      );
    }
    if (this.record.recoveryPatterns?.length) {
      const top = this.record.recoveryPatterns[0]!;
      hints.push(`Recovery hint: ${top.pattern} → ${top.fix}`);
    }
    if (this.record.projectArchetype) {
      hints.push(`Project archetype: ${this.record.projectArchetype}`);
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

  recordArenaFinish(input: {
    files: string[];
    roleCounts: Record<string, number>;
    summaries: { userSim?: string; security?: string; performance?: string; scan: string };
  }): void {
    this.record.lastArena = {
      timestamp: Date.now(),
      roleCounts: input.roleCounts,
      files: input.files.slice(0, 50),
      userSimSummary: input.summaries.userSim,
      securitySummary: input.summaries.security,
      performanceSummary: input.summaries.performance,
      scanSummary: input.summaries.scan,
    };
  }

  recordBuildFinish(input: { files: string[]; scanSummary: string }): void {
    this.record.lastBuild = {
      timestamp: Date.now(),
      files: input.files.slice(0, 50),
      scanSummary: input.scanSummary.slice(0, 500),
    };
  }

  getBuildHint(): string | undefined {
    const last = this.record.lastBuild;
    if (!last) return undefined;
    const files = last.files.slice(0, 5).join(', ');
    return `Last build: ${last.scanSummary}. Files: ${files}${last.files.length > 5 ? '…' : ''}`;
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

  recordFailure(input: {
    runId: string;
    userMessage: string;
    issues: CompletionGateIssue[];
    archetype?: FashionProjectArchetype;
  }): void {
    this.record.lastFailure = {
      runId: input.runId,
      timestamp: Date.now(),
      issues: input.issues,
      archetype: input.archetype,
      userMessage: input.userMessage.slice(0, 500),
    };
    if (input.archetype) {
      this.record.projectArchetype = input.archetype;
    }
    if (!this.record.recoveryPatterns?.length) {
      this.record.recoveryPatterns = [...DEFAULT_RECOVERY_PATTERNS];
    }
  }

  setProjectArchetype(archetype: FashionProjectArchetype): void {
    this.record.projectArchetype = archetype;
  }

  getRecentRuns(limit = 5): PipelineRunMemory[] {
    return this.record.runs.slice(-limit);
  }

  appendPreference(key: string, value: string): void {
    this.record.preferences[key] = value.slice(0, 500);
  }

  toJSON(): PipelineMemoryRecord {
    return { ...this.record, runs: [...this.record.runs] };
  }
}
