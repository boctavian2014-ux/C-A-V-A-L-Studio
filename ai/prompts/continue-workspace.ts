import type { WorkspaceDiscoverySnapshot } from '../../src/shared/workspace-discovery-contract';

export const CONTINUE_WORKSPACE_MARKER = 'CONTINUE_WORKSPACE';

export function buildContinueWorkspaceContextMessage(snapshot: WorkspaceDiscoverySnapshot): string {
  if (!snapshot.ok) {
    return [CONTINUE_WORKSPACE_MARKER, '', snapshot.error ?? 'Workspace discovery failed.'].join('\n');
  }

  const lines = [
    CONTINUE_WORKSPACE_MARKER,
    '',
    'Inspectia workspace-ului activ (read-only) este finalizată. Nu cere utilizatorului „următorul fișier”.',
    'Folosește contextul de mai jos pentru a continua cu următorul pas sigur.',
    '',
    `Project: ${snapshot.projectName}`,
    `Type: ${snapshot.projectType}`,
    `package.json: ${snapshot.hasPackageJson ? 'yes' : 'no'}`,
    `Key dirs: ${snapshot.keyDirs.join(', ') || 'none'}`,
    `Root entries: ${snapshot.rootEntries.slice(0, 20).join(', ')}`,
  ];

  if (snapshot.git?.isRepo) {
    lines.push(
      `Git: branch=${snapshot.git.branch ?? '?'} modified=${snapshot.git.modifiedCount}`,
      `Modified files: ${snapshot.git.modifiedFiles.join(', ') || 'none'}`,
      snapshot.git.lastCommit ? `Last commit: ${snapshot.git.lastCommit}` : 'Last commit: unknown'
    );
  }

  if (snapshot.todos.length) {
    lines.push(
      'TODO/FIXME:',
      ...snapshot.todos.map((t) => `- ${t.file}:${t.line} ${t.tag} ${t.excerpt}`)
    );
  }

  if (snapshot.verify) {
    lines.push(`Verify: ran=${snapshot.verify.ran} summary=${snapshot.verify.summary}`);
  }

  lines.push('', `Recommended next step: ${snapshot.recommendedNextStep}`);
  return lines.join('\n');
}
