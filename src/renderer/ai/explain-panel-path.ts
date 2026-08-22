/** Short label for explain panel header ΓÇö never show full absolute paths in the UI. */
export function formatExplainPanelPath(filePath: string, projectPath: string | null): string {
  const trimmed = filePath.trim();
  if (!trimmed) return "";

  let rel = trimmed.replace(/\\/g, "/");
  if (projectPath) {
    const root = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (rel.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
      rel = rel.slice(root.length + 1);
    }
  }
  rel = rel.replace(/^\.?\//, "");

  if (rel.length <= 56) return rel;
  const parts = rel.split("/");
  if (parts.length >= 2) {
    return `ΓÇª/${parts.slice(-2).join("/")}`;
  }
  return `ΓÇª${rel.slice(-52)}`;
}
