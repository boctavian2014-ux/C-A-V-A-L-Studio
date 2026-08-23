import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMonacoEditor = vi.fn();
const editorGetState = vi.fn();
const editorRefreshTree = vi.fn(async () => undefined);
const aiGetState = vi.fn();
const aiSetState = vi.fn();
const emitEditorFileWriteTimeline = vi.fn(async () => ({
  timelineEvents: [{ id: 'tl-1', type: 'file_write' }],
}));
const liveClearAll = vi.fn();

vi.mock('../../src/renderer/store/editor-command-store', () => ({
  getMonacoEditor: (...args: unknown[]) => getMonacoEditor(...args),
}));

vi.mock('../../src/renderer/store/editor-store', () => ({
  useEditorStore: {
    getState: (...args: unknown[]) => editorGetState(...args),
  },
}));

vi.mock('../../ai/composer/ai-store', () => ({
  useAIStore: {
    getState: (...args: unknown[]) => aiGetState(...args),
    setState: (...args: unknown[]) => aiSetState(...args),
  },
}));

vi.mock('../../src/renderer/ai/inline-completion-timeline', () => ({
  emitEditorFileWriteTimeline: (...args: unknown[]) => emitEditorFileWriteTimeline(...args),
}));

vi.mock('../../ai/composer/live-ai-edits-store', () => ({
  useLiveAiEditsStore: {
    getState: () => ({ clearAll: liveClearAll }),
  },
}));

vi.mock('monaco-editor', () => ({ default: {} }));

import {
  acceptProposedWritesForMessage,
  applyProposedWriteInOpenEditor,
  previewTextsForWrite,
  rejectProposedWritesForMessage,
  revertAppliedNewWrites,
} from '../../ai/composer/chat-apply-controller';

const write = {
  path: 'src/a.ts',
  content: 'export const a = 1;\n',
  isNew: true,
  previousContent: '',
};

function installCaval(api: Record<string, unknown>) {
  vi.stubGlobal('window', { caval: api });
}

describe('chat-apply-controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorRefreshTree.mockResolvedValue(undefined);
    editorGetState.mockReturnValue({
      tabs: [{ id: 'tab-1', path: '/ws/src/a.ts' }],
      activeTabId: 'tab-1',
      projectPath: '/ws',
      refreshTree: editorRefreshTree,
    });
    aiGetState.mockReturnValue({
      messages: [
        {
          id: 'msg-1',
          proposedWrites: [write],
          proposeStageKey: 'stage-1',
          streamId: 'stream-1',
          timelineEvents: [],
        },
      ],
      activeThreadId: 'thread-1',
      threads: [{ id: 'thread-1', messages: [] }],
    });
  });

  it('returns false when no Monaco editor is open', () => {
    getMonacoEditor.mockReturnValue(null);
    expect(applyProposedWriteInOpenEditor({} as never, '/ws/src/a.ts', 'x')).toBe(false);
  });

  it('returns false when there is no active tab', () => {
    getMonacoEditor.mockReturnValue({
      getModel: () => ({ getFullModelRange: () => ({}) }),
      pushUndoStop: vi.fn(),
      executeEdits: vi.fn(() => true),
    });
    editorGetState.mockReturnValue({
      tabs: [{ id: 'tab-1', path: '/ws/src/a.ts' }],
      activeTabId: 'missing',
      projectPath: '/ws',
      refreshTree: editorRefreshTree,
    });
    expect(applyProposedWriteInOpenEditor({} as never, '/ws/src/a.ts', 'x')).toBe(false);
  });

  it('returns false when Monaco executeEdits fails', () => {
    const executeEdits = vi.fn(() => false);
    const pushUndoStop = vi.fn();
    getMonacoEditor.mockReturnValue({
      getModel: () => ({ getFullModelRange: () => ({ startLineNumber: 1 }) }),
      pushUndoStop,
      executeEdits,
    });
    expect(applyProposedWriteInOpenEditor({} as never, '/ws/src/a.ts', 'x')).toBe(false);
    expect(executeEdits).toHaveBeenCalledTimes(1);
    expect(pushUndoStop).toHaveBeenCalledTimes(2);
  });

  it('returns false when the open tab does not match the write path', () => {
    getMonacoEditor.mockReturnValue({
      getModel: () => ({ getFullModelRange: () => ({}) }),
      pushUndoStop: vi.fn(),
      executeEdits: vi.fn(() => true),
    });
    editorGetState.mockReturnValue({
      tabs: [{ id: 'tab-1', path: '/ws/src/other.ts' }],
      activeTabId: 'tab-1',
      projectPath: '/ws',
      refreshTree: editorRefreshTree,
    });
    expect(applyProposedWriteInOpenEditor({} as never, '/ws/src/a.ts', 'x')).toBe(false);
  });

  it('applies content through Monaco undo stops for the matching tab', () => {
    const executeEdits = vi.fn(() => true);
    const pushUndoStop = vi.fn();
    getMonacoEditor.mockReturnValue({
      getModel: () => ({ getFullModelRange: () => ({ startLineNumber: 1 }) }),
      pushUndoStop,
      executeEdits,
    });
    expect(applyProposedWriteInOpenEditor({} as never, '/ws/src/a.ts', 'export const a = 2;')).toBe(
      true
    );
    expect(executeEdits).toHaveBeenCalledWith(
      'ai-chat-apply',
      expect.arrayContaining([expect.objectContaining({ text: 'export const a = 2;' })])
    );
    expect(pushUndoStop).toHaveBeenCalledTimes(2);
  });

  it('does not call chatApplyAccept when projectPath is missing', async () => {
    const chatApplyAccept = vi.fn();
    installCaval({ chatApplyAccept });
    editorGetState.mockReturnValue({
      tabs: [],
      activeTabId: null,
      projectPath: '',
      refreshTree: editorRefreshTree,
    });

    await acceptProposedWritesForMessage('msg-1');
    expect(chatApplyAccept).not.toHaveBeenCalled();
    expect(aiSetState).not.toHaveBeenCalled();
  });

  it('does nothing when the message has no proposed writes', async () => {
    const chatApplyAccept = vi.fn();
    installCaval({ chatApplyAccept });
    aiGetState.mockReturnValue({ messages: [{ id: 'msg-1' }], activeThreadId: 'thread-1' });

    await acceptProposedWritesForMessage('msg-1');
    expect(chatApplyAccept).not.toHaveBeenCalled();
  });

  it('does not update store state when chatApplyAccept fails', async () => {
    const chatApplyAccept = vi.fn().mockResolvedValue({ ok: false });
    installCaval({ chatApplyAccept });

    await acceptProposedWritesForMessage('msg-1');
    expect(chatApplyAccept).toHaveBeenCalledWith(
      expect.objectContaining({
        stageKey: 'stage-1',
        messageId: 'msg-1',
        conversationId: 'thread-1',
      })
    );
    expect(aiSetState).not.toHaveBeenCalled();
    expect(liveClearAll).not.toHaveBeenCalled();
  });

  it('accepts writes, records applied paths, and clears live edits', async () => {
    const chatApplyAccept = vi.fn().mockResolvedValue({
      ok: true,
      applied: ['src/a.ts'],
      writes: [write],
    });
    installCaval({ chatApplyAccept });
    getMonacoEditor.mockReturnValue(null);

    await acceptProposedWritesForMessage('msg-1');

    expect(chatApplyAccept).toHaveBeenCalledTimes(1);
    expect(emitEditorFileWriteTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'src/a.ts' })
    );
    expect(aiSetState).toHaveBeenCalledTimes(1);
    const next = aiSetState.mock.calls[0]![0]({
      messages: aiGetState().messages,
      threads: aiGetState().threads,
      activeThreadId: 'thread-1',
    });
    expect(next.messages[0].proposedWrites).toBeUndefined();
    expect(next.messages[0].writtenFiles).toEqual(['src/a.ts']);
    expect(editorRefreshTree).toHaveBeenCalledTimes(1);
    expect(liveClearAll).toHaveBeenCalledTimes(1);
  });

  it('rejects proposed writes and clears the proposal without calling accept', async () => {
    const chatApplyReject = vi.fn().mockResolvedValue(undefined);
    const chatApplyAccept = vi.fn();
    installCaval({ chatApplyReject, chatApplyAccept });

    await rejectProposedWritesForMessage('msg-1');

    expect(chatApplyReject).toHaveBeenCalledWith({ stageKey: 'stage-1' });
    expect(chatApplyAccept).not.toHaveBeenCalled();
    expect(aiSetState).toHaveBeenCalled();
    const next = aiSetState.mock.calls[0]![0]({
      messages: aiGetState().messages,
      threads: aiGetState().threads,
      activeThreadId: 'thread-1',
    });
    expect(next.messages[0].proposedWrites).toBeUndefined();
    expect(next.messages[0].writtenFiles).toEqual([]);
    expect(liveClearAll).toHaveBeenCalledTimes(1);
  });

  it('reverts applied new writes and refreshes the tree', async () => {
    const chatApplyRevertNew = vi.fn().mockResolvedValue(undefined);
    installCaval({ chatApplyRevertNew });

    await revertAppliedNewWrites([write]);

    expect(chatApplyRevertNew).toHaveBeenCalledWith({ writes: [write] });
    expect(editorRefreshTree).toHaveBeenCalledTimes(1);
  });

  it('builds preview texts from previous and new content', () => {
    const texts = previewTextsForWrite({
      path: 'src/a.ts',
      content: 'new',
      isNew: false,
      previousContent: 'old',
    });
    expect(texts.original).toContain('old');
    expect(texts.modified).toContain('new');
  });

  it('treats missing previousContent as empty original preview', () => {
    const texts = previewTextsForWrite({
      path: 'src/a.ts',
      content: 'new',
      isNew: true,
    } as never);
    expect(texts.original).toBeDefined();
    expect(texts.modified).toContain('new');
  });
});
