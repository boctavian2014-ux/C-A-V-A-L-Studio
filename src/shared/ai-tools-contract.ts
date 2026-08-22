/**
 * Pas 5.3 v1 — safe IDE tools (problems / git status / package.json tasks / preview).
 * git_commit and free terminal commands are intentionally excluded.
 */

export const AI_TOOL_NAMES = [
  "get_problems",
  "git_status",
  "run_task",
  "open_preview",
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];

export interface AiToolCall {
  id: string;
  name: AiToolName;
  args: Record<string, unknown>;
}

export interface AiToolResult {
  id: string;
  success: boolean;
  output: string;
  error?: string;
}

export function isAiToolName(name: unknown): name is AiToolName {
  return typeof name === "string" && (AI_TOOL_NAMES as readonly string[]).includes(name);
}

export const AI_TOOL_DEFINITIONS: Array<{
  name: AiToolName;
  description: string;
  parameters: Record<string, unknown>;
}> = [
  {
    name: "get_problems",
    description: "Get current TypeScript and ESLint problems in the bound workspace",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "git_status",
    description: "Get current Git status (branch, modified files) for the bound workspace",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "run_task",
    description: "Run a package.json script by name (must already exist in the workspace)",
    parameters: {
      type: "object",
      properties: {
        taskName: {
          type: "string",
          description: "Script name from package.json",
        },
      },
      required: ["taskName"],
    },
  },
  {
    name: "open_preview",
    description: "Open the web or mobile preview for the bound workspace",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: ["web", "mobile"],
          description: "Preview target",
        },
      },
      required: ["target"],
    },
  },
];
