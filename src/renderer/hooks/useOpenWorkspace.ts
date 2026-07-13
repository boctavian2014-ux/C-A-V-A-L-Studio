import { useCallback } from 'react';
import { useAIStore } from '../../../ai/composer/ai-store';
import { useEditorStore } from '../store/editor-store';
import { useGitStore } from '../store/git-store';

export type WorkspaceOpenSource = 'folder' | 'clone';

export function useOpenWorkspace() {
  const setProjectPath = useEditorStore((s) => s.setProjectPath);
  const setFileTree = useEditorStore((s) => s.setFileTree);

  const openWorkspace = useCallback(
    async (folderPath: string, source: WorkspaceOpenSource = 'folder') => {
      setProjectPath(folderPath);
      useAIStore.getState().setIncludeMode('project');
      const tree = await window.caval.fs.readTree(folderPath);
      setFileTree(tree);
      await window.caval.workspaceOpen?.(folderPath, { source });
      await useGitStore.getState().refresh();
    },
    [setProjectPath, setFileTree]
  );

  const pickAndOpenFolder = useCallback(async () => {
    const folderPath = await window.caval.fs.openFolder();
    if (!folderPath) return;
    await openWorkspace(folderPath, 'folder');
  }, [openWorkspace]);

  return { openWorkspace, pickAndOpenFolder };
}
