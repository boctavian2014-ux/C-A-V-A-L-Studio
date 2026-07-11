import { z } from "zod";

export const fsReadFileSchema = z.object({
  filePath: z.string().min(1),
});

export const fsWriteFileSchema = z.object({
  filePath: z.string().min(1),
  content: z.string(),
});

export const fsPathSchema = z.object({
  targetPath: z.string().min(1),
});

export const fsRenameSchema = z.object({
  oldPath: z.string().min(1),
  newPath: z.string().min(1),
});

export const searchTextSchema = z.object({
  query: z.string().min(1),
  workspaceRoot: z.string().min(1),
  caseSensitive: z.boolean().optional(),
  maxResults: z.number().int().positive().max(500).optional(),
});

export const symbolLookupSchema = z.object({
  workspaceRoot: z.string().min(1),
  filePath: z.string().min(1),
  symbol: z.string().min(1),
});

export const debugLaunchSchema = z.object({
  workspaceRoot: z.string().min(1),
  program: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
});

export function parseIpcInput<T>(schema: z.ZodType<T>, input: unknown): T {
  return schema.parse(input);
}
