/** Merge MCP server env without blank overrides; inject app secrets. */

const MCP_SECRET_ENV_KEYS = [
  'FIRECRAWL_API_KEY',
  'POSTGRES_CONNECTION_STRING',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
  'SEMGREP_APP_TOKEN',
] as const;

export function mergeMcpServerEnv(
  configEnv?: Record<string, string>,
  secrets?: Record<string, string>
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  if (configEnv) {
    for (const [key, value] of Object.entries(configEnv)) {
      const trimmed = value?.trim();
      if (trimmed) env[key] = trimmed;
    }
  }

  if (secrets) {
    for (const key of MCP_SECRET_ENV_KEYS) {
      const value = secrets[key]?.trim();
      if (value) env[key] = value;
    }
  }

  return env;
}

/** Hint for common MCP start failures (shown in UI). */
export function mcpStartErrorHint(serverId: string, error: string): string | undefined {
  const lower = error.toLowerCase();
  if (serverId === 'fetch' && (lower.includes('e404') || lower.includes('not found') || lower.includes('uvx'))) {
    return 'Fetch MCP: uvx mcp-server-fetch (pip install uv dacă lipsește uvx)';
  }
  if (serverId === 'git') {
    if (lower.includes('not a valid git repository') || lower.includes('not a git repository')) {
      return 'Git MCP necesită un repo Git: git init în workspace sau deschide un folder clonat';
    }
    if (lower.includes('e404') || lower.includes('not found') || lower.includes('enoent')) {
      return 'Git MCP necesită uv/uvx (pip install uv) sau Python: pip install mcp-server-git';
    }
    if (lower.includes('uvx') || lower.includes('not recognized')) {
      return 'Instalează uv: pip install uv — apoi uvx mcp-server-git funcționează';
    }
  }
  if (serverId === 'postgres' && lower.includes('connection')) {
    return 'Setează connection string în caval.jsonc args sau POSTGRES_CONNECTION_STRING în secrets';
  }
  if (serverId === 'firecrawl' && (lower.includes('api') || lower.includes('key'))) {
    return 'Adaugă FIRECRAWL_API_KEY în AI & Chei API sau secrets';
  }
  if (serverId === 'github') {
    if (lower.includes('docker') || lower.includes('not recognized') || lower.includes('enoent')) {
      return 'GitHub MCP necesită Docker Desktop pornit: docker pull ghcr.io/github/github-mcp-server';
    }
    if (lower.includes('token') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) {
      return 'Adaugă GITHUB_PERSONAL_ACCESS_TOKEN în Settings → AI & Chei (read-only PAT)';
    }
  }
  if (serverId === 'semgrep') {
    if (lower.includes('e404') || lower.includes('not found') || lower.includes('enoent') || lower.includes('uvx')) {
      return 'Semgrep MCP: pip install uv, apoi uvx --from semgrep semgrep mcp';
    }
    if (lower.includes('semgrep') && lower.includes('not recognized')) {
      return 'Instalează Semgrep: uvx --from semgrep semgrep --version';
    }
  }
  if (serverId === 'trivy') {
    if (lower.includes('not recognized') || lower.includes('enoent') || lower.includes('unknown command')) {
      return 'Instalează Trivy și rulează: trivy plugin install mcp';
    }
    if (lower.includes('plugin') || lower.includes('mcp')) {
      return 'Rulează o dată: trivy plugin install mcp';
    }
  }
  return undefined;
}
