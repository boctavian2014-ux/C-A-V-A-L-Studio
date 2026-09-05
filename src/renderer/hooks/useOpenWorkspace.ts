import { useCallback } from 'react';
import { useAIStore } from '../../../ai/composer/ai-store';
import { useEditorStore } from '../store/editor-store';
import { useGitStore } from '../store/git-store';

export type WorkspaceOpenSource = 'folder' | 'clone';
export { projectNameFromPrompt } from './project-name-from-prompt';

/**
 * Bind Explorer + sandbox to an existing folder (no picker).
 * Sets projectPath before workspaceOpen so a restored chat is not wiped by
 * caval:workspace-session-reset.
 */
export async function openBoundWorkspace(
  folderPath: string,
  source: WorkspaceOpenSource = 'folder'
): Promise<{ ok: boolean; error?: string }> {
  const root = folderPath.trim();
  if (!root) return { ok: false, error: 'Empty workspace path' };

  const prev = useEditorStore.getState().projectPath;
  useEditorStore.getState().setProjectPath(root);
  useAIStore.getState().setIncludeMode('project');

  const opened = await window.caval.workspaceOpen?.(root, { source });
  if (opened && opened.ok === false) {
    if (prev?.trim()) {
      useEditorStore.getState().setProjectPath(prev);
    } else {
      useEditorStore.setState({ projectPath: null, fileTree: [] });
    }
    return { ok: false, error: opened.error ?? 'Workspace open failed' };
  }

  const bound = opened?.path ?? root;
  if (bound !== root) useEditorStore.getState().setProjectPath(bound);
  await window.caval.workspaceSync?.(bound);
  try {
    const tree = await window.caval.fs.readTree(bound);
    useEditorStore.getState().setFileTree(tree);
  } catch {
    /* tree optional if the folder is empty */
  }
  await useGitStore.getState().refresh();
  return { ok: true };
}

export function useOpenWorkspace() {
  const openWorkspace = useCallback(
    async (folderPath: string, source: WorkspaceOpenSource = 'folder') => {
      await openBoundWorkspace(folderPath, source);
    },
    []
  );

  const pickAndOpenFolder = useCallback(async () => {
    const folderPath = await window.caval.fs.openFolder();
    if (!folderPath) return;
    await openWorkspace(folderPath, 'folder');
  }, [openWorkspace]);

  return { openWorkspace, pickAndOpenFolder };
}

/**
 * Ensure a writable workspace: reuse open project, else create on Desktop
 * (fallback Downloads). No-op when projectPath already set.
 */
export async function ensureDesktopProject(name: string): Promise<{
  ok: boolean;
  path?: string;
  created?: boolean;
  location?: 'desktop' | 'downloads';
  error?: string;
}> {
  const existing = useEditorStore.getState().projectPath;
  if (existing?.trim()) {
    return { ok: true, path: existing, created: false };
  }

  const created = await window.caval.workspace?.createOnDesktop?.({
    name: name.trim() || 'Caval-Project',
  });
  if (!created?.ok || !created.path) {
    return {
      ok: false,
      error:
        created?.error ??
        'Nu am putut crea folderul pe Desktop sau în Downloads.',
    };
  }

  useEditorStore.getState().setProjectPath(created.path);
  useAIStore.getState().setIncludeMode('project');
  await window.caval.workspaceOpen?.(created.path, { source: 'folder' });
  await window.caval.workspaceSync?.(created.path);
  try {
    const tree = await window.caval.fs.readTree(created.path);
    useEditorStore.getState().setFileTree(tree);
  } catch {
    /* tree optional until files exist */
  }
  await useGitStore.getState().refresh();

  return {
    ok: true,
    path: created.path,
    created: true,
    location: created.location,
  };
}

/** Write a file into the open workspace (absolute path under project root). */
export async function writeWorkspaceFile(
  relativePath: string,
  content: string
): Promise<{ ok: boolean; error?: string }> {
  const root = useEditorStore.getState().projectPath;
  if (!root) return { ok: false, error: 'Niciun proiect deschis.' };
  const sep = root.includes('\\') ? '\\' : '/';
  const full = `${root.replace(/[\\/]+$/, '')}${sep}${relativePath.replace(/^[\\/]+/, '')}`;
  try {
    const result = await window.caval.fs.writeFile(full, content);
    if (result && typeof result === 'object' && 'ok' in result && !(result as { ok: boolean }).ok) {
      return { ok: false, error: (result as { error?: string }).error ?? 'writeFile failed' };
    }
    const tree = await window.caval.fs.readTree(root);
    useEditorStore.getState().setFileTree(tree);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
