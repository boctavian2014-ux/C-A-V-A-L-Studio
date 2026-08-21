export function joinWorkspaceRelativePath(root: string, relativePath: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  const rel = relativePath.replace(/[/\\]+/g, sep).replace(new RegExp(`^\\${sep}+`), "");
  return `${root.replace(/[/\\]+$/, "")}${sep}${rel}`;
}

export function formatWrittenFilesHeadline(count: number): string {
  return `✓ ${count} fișier(e) create în workspace`;
}
