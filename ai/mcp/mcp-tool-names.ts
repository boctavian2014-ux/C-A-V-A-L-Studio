export function mcpToolId(serverId: string, toolName: string): string {
  return `mcp:${serverId}:${toolName}`;
}

export function parseMcpToolId(
  id: string
): { serverId: string; toolName: string } | null {
  if (!id.startsWith("mcp:")) return null;
  const rest = id.slice(4);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  return {
    serverId: rest.slice(0, colon),
    toolName: rest.slice(colon + 1),
  };
}
