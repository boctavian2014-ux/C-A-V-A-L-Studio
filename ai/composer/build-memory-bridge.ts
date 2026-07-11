import type { PipelineMemoryRecord } from './multi-agent/pipeline-memory';

export interface LastBuildRecord {
  timestamp: number;
  files: string[];
  scanSummary: string;
}

export type BuildMemoryRecord = PipelineMemoryRecord & {
  lastBuild?: LastBuildRecord;
};

const MEMORY_REL = ['.cavalo', 'memory', 'global.json'];

export function buildMemoryFilePath(projectPath: string): string {
  const sep = projectPath.includes('\\') ? '\\' : '/';
  return `${projectPath}${sep}${MEMORY_REL.join(sep)}`;
}

export function mergeLastBuild(
  record: BuildMemoryRecord,
  input: { files: string[]; scanSummary: string }
): BuildMemoryRecord {
  return {
    ...record,
    updatedAt: Date.now(),
    lastBuild: {
      timestamp: Date.now(),
      files: input.files.slice(0, 50),
      scanSummary: input.scanSummary.slice(0, 500),
    },
  };
}

export function buildMemoryHint(record: BuildMemoryRecord | null): string | undefined {
  const last = record?.lastBuild;
  if (!last) return undefined;
  const files = last.files.slice(0, 5).join(', ');
  return `Last build (${new Date(last.timestamp).toISOString()}): ${last.scanSummary}. Files: ${files}${last.files.length > 5 ? '…' : ''}`;
}

export function parseBuildMemoryRecord(raw: string, projectPath: string): BuildMemoryRecord {
  try {
    const parsed = JSON.parse(raw) as BuildMemoryRecord;
    if (parsed.version === 1) {
      return { ...parsed, projectPath };
    }
  } catch {
    // fresh
  }
  return {
    version: 1,
    projectPath,
    updatedAt: Date.now(),
    runs: [],
    preferences: {},
  };
}

export async function loadBuildMemoryRecord(
  projectPath: string,
  readFile: (path: string) => Promise<{ ok: boolean; content?: string }>
): Promise<BuildMemoryRecord> {
  const filePath = buildMemoryFilePath(projectPath);
  const res = await readFile(filePath);
  if (res.ok && res.content) {
    return parseBuildMemoryRecord(res.content, projectPath);
  }
  return parseBuildMemoryRecord('{}', projectPath);
}

export async function persistLastBuild(
  projectPath: string,
  input: { files: string[]; scanSummary: string },
  io: {
    readFile: (path: string) => Promise<{ ok: boolean; content?: string }>;
    writeFile: (path: string, content: string) => Promise<{ ok: boolean }>;
  }
): Promise<void> {
  const filePath = buildMemoryFilePath(projectPath);
  const existing = await loadBuildMemoryRecord(projectPath, io.readFile);
  const merged = mergeLastBuild(existing, input);
  await io.writeFile(filePath, JSON.stringify(merged, null, 2));
}
