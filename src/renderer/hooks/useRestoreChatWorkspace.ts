import { useEffect, useRef, useState } from 'react';

import { useAIStore } from '../../../ai/composer/ai-store';
import {
  resolveThreadWorkspacePath,
  shouldRestoreThreadWorkspace,
} from '../../../ai/composer/workspace-session';
import { useEditorStore } from '../store/editor-store';
import { openBoundWorkspace } from './useOpenWorkspace';

function waitForAiStoreHydration(onReady: () => void): () => void {
  const persistApi = (
    useAIStore as typeof useAIStore & {
      persist?: {
        hasHydrated?: () => boolean;
        onFinishHydration?: (cb: () => void) => () => void;
      };
    }
  ).persist;
  if (!persistApi?.onFinishHydration) {
    onReady();
    return () => undefined;
  }
  if (persistApi.hasHydrated?.()) {
    onReady();
    return () => undefined;
  }
  return persistApi.onFinishHydration(() => onReady());
}

/**
 * When chat restores a conversation, also open the folder it wrote into.
 * The user should not have to File → Open Folder for a remembered thread.
 */
export function useRestoreChatWorkspace(): void {
  const [hydrated, setHydrated] = useState(false);
  const inFlight = useRef<string | null>(null);
  const failed = useRef<Set<string>>(new Set());
  const projectPath = useEditorStore((s) => s.projectPath);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const activeThreadId = useAIStore((s) => s.activeThreadId);
  const threadWorkspace = useAIStore((s) => {
    const thread = s.threads.find((t) => t.id === s.activeThreadId);
    return resolveThreadWorkspacePath(thread);
  });

  useEffect(() => waitForAiStoreHydration(() => setHydrated(true)), []);

  useEffect(() => {
    if (!hydrated || isStreaming) return;
    if (!shouldRestoreThreadWorkspace(threadWorkspace, projectPath) || !threadWorkspace) {
      return;
    }
    if (inFlight.current === threadWorkspace) return;
    if (failed.current.has(threadWorkspace)) return;

    const thread = useAIStore.getState().threads.find((t) => t.id === activeThreadId);
    if (thread && thread.workspacePath !== threadWorkspace) {
      useAIStore.setState((s) => ({
        threads: s.threads.map((t) =>
          t.id === thread.id ? { ...t, workspacePath: threadWorkspace } : t
        ),
      }));
    }

    inFlight.current = threadWorkspace;
    void openBoundWorkspace(threadWorkspace)
      .then((result) => {
        if (!result.ok) failed.current.add(threadWorkspace);
      })
      .finally(() => {
        if (inFlight.current === threadWorkspace) inFlight.current = null;
      });
  }, [hydrated, isStreaming, activeThreadId, projectPath, threadWorkspace]);
}
