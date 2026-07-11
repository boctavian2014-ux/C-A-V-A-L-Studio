import path from "node:path";

/** Replace static "." workspace placeholders in MCP server args with the real project path. */
export function injectWorkspaceIntoMcpArgs(
  args: string[] | undefined,
  workspaceRoot?: string
): string[] {
  if (!workspaceRoot?.trim()) return args ?? [];
  const resolved = path.resolve(workspaceRoot);
  return (args ?? []).map((arg) => {
    if (arg === ".") return resolved;
    if (arg === "--repository" || arg === "-r") return arg;
    return arg;
  });
}

/** Pair-aware injection: `--repository .` → `--repository <root>` */
export function resolveMcpServerArgs(
  args: string[] | undefined,
  workspaceRoot?: string
): string[] {
  if (!workspaceRoot?.trim()) return args ?? [];
  const resolved = path.resolve(workspaceRoot);
  const out: string[] = [];
  for (let i = 0; i < (args ?? []).length; i++) {
    const arg = args![i];
    const next = args![i + 1];
    if ((arg === "--repository" || arg === "-r") && next === ".") {
      out.push(arg, resolved);
      i++;
      continue;
    }
    if (arg === ".") {
      out.push(resolved);
      continue;
    }
    out.push(arg);
  }
  return out;
}
