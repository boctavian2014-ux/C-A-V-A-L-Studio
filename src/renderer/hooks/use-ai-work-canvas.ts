import { useEffect, useRef } from 'react';

import { useAIStore } from '../../../ai/composer/ai-store';
import { useLiveAiEditsStore } from '../../../ai/composer/live-ai-edits-store';
import { useLiveAiEditEvents } from '../../../ai/composer/use-live-ai-edits';
import { useAiWorkCanvasStore } from '../store/ai-work-canvas-store';
import { useEditorStore } from '../store/editor-store';
import { getCurrentWritingPath } from '../ai/work-canvas-steps';

function followWritingPath(path: string, content: string): void {
  const { followAi } = useAiWorkCanvasStore.getState();
  if (!followAi) return;
  useEditorStore.getState().updateAiPreview(path, content);
  useAiWorkCanvasStore.getState().setLastFollowedPath(path);
}

export function useAiWorkCanvasController(): void {
  const isStreaming = useAIStore((s) => s.isStreaming);
  const followAi = useAiWorkCanvasStore((s) => s.followAi);
  const order = useLiveAiEditsStore((s) => s.order);
  const edits = useLiveAiEditsStore((s) => s.edits);
  const prevStreaming = useRef(false);

  useEffect(() => {
    if (isStreaming && !prevStreaming.current) {
      useAiWorkCanvasStore.getState().onStreamStart();
    }
    if (!isStreaming && prevStreaming.current) {
      useAiWorkCanvasStore.getState().onStreamEnd();
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming || !followAi) return;
    const path = getCurrentWritingPath(order, edits);
    if (!path) return;
    const edit = edits[path];
    followWritingPath(path, edit?.content ?? '');
  }, [isStreaming, followAi, order, edits]);

  useLiveAiEditEvents((type, detail) => {
    if (!useAIStore.getState().isStreaming) return;
    if (!useAiWorkCanvasStore.getState().followAi) return;
    if (type !== 'ai-edit-start' && type !== 'ai-edit-progress') return;
    const path = detail.path;
    if (!path) return;
    const edit = useLiveAiEditsStore.getState().edits[path];
    followWritingPath(path, edit?.content ?? '');
  });
}
