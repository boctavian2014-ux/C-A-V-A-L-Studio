import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ParallelPriority, ParallelTaskInput, ParallelTaskType } from "./parallel-types";

const LARGE_FILE_CHARS = 32_000;
const BATCH_CHARS = 16_000;

export function splitLargeContent(content: string, batchChars = BATCH_CHARS): string[] {
  if (content.length <= LARGE_FILE_CHARS) return [content];
  const batches: string[] = [];
  for (let index = 0; index < content.length; index += batchChars) {
    batches.push(content.slice(index, index + batchChars));
  }
  return batches;
}

export function createTasksForFile(input: {
  workspaceRoot: string;
  filePath: string;
  content?: string;
  priority: ParallelPriority;
  tokenId?: string;
  includeEmbeddings?: boolean;
  includeSymbols?: boolean;
  includeDependencies?: boolean;
  includeSemantic?: boolean;
}): ParallelTaskInput[] {
  const createdAt = Date.now();
  const relativePath = path.relative(input.workspaceRoot, input.filePath);
  const batches = input.content ? splitLargeContent(input.content) : [undefined];
  const tasks: ParallelTaskInput[] = [];

  tasks.push(task("file", input, relativePath, input.content, 0, 1, createdAt));

  batches.forEach((content, index) => {
    const total = batches.length;
    if (input.includeEmbeddings) tasks.push(task("embedding", input, relativePath, content, index, total, createdAt));
    if (input.includeSemantic) tasks.push(task("semantic", input, relativePath, content, index, total, createdAt));
  });

  if (input.includeSymbols) tasks.push(task("symbols", input, relativePath, input.content, 0, 1, createdAt));
  if (input.includeDependencies) tasks.push(task("dependencies", input, relativePath, input.content, 0, 1, createdAt));

  return tasks;
}

function task(
  type: ParallelTaskType,
  input: {
    workspaceRoot: string;
    filePath: string;
    content?: string;
    priority: ParallelPriority;
    tokenId?: string;
  },
  relativePath: string,
  content: string | undefined,
  batchIndex: number,
  totalBatches: number,
  createdAt: number
): ParallelTaskInput {
  return {
    taskId: randomUUID(),
    type,
    priority: input.priority,
    workspaceRoot: input.workspaceRoot,
    filePath: input.filePath,
    relativePath,
    content,
    batchIndex,
    totalBatches,
    createdAt,
    tokenId: input.tokenId,
  };
}
