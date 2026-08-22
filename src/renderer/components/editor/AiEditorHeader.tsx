import React from 'react';

import { useTranslation } from '../../../../ai/i18n/useTranslation';
import { useAIStore } from '../../../../ai/composer/ai-store';
import { useLiveAiEditsStore } from '../../../../ai/composer/live-ai-edits-store';
import { joinWorkspaceRelativePath } from '../../../../ai/composer/written-files';
import { useAiWorkCanvasStore } from '../../store/ai-work-canvas-store';
import { useEditorStore } from '../../store/editor-store';
import { getCurrentWritingPath } from '../../ai/work-canvas-steps';

type AiEditorHeaderProps = {
  relativePath: string;
  isStreaming: boolean;
};

export function AiEditorHeader({ relativePath, isStreaming }: AiEditorHeaderProps) {
  const { t } = useTranslation();
  const followAi = useAiWorkCanvasStore((s) => s.followAi);
  const setFollowAi = useAiWorkCanvasStore((s) => s.setFollowAi);
  const stopStreaming = useAIStore((s) => s.stopStreaming);
  const order = useLiveAiEditsStore((s) => s.order);
  const edits = useLiveAiEditsStore((s) => s.edits);
  const projectPath = useEditorStore((s) => s.projectPath);
  const openFile = useEditorStore((s) => s.openFile);
  const updateAiPreview = useEditorStore((s) => s.updateAiPreview);

  const statusLabel = isStreaming ? t('workCanvas.header.writing') : t('workCanvas.header.preview');

  const handleOpenFile = () => {
    if (!projectPath || !relativePath) return;
    setFollowAi(false);
    void openFile(joinWorkspaceRelativePath(projectPath, relativePath));
  };

  const handleFollowToggle = () => {
    const next = !followAi;
    setFollowAi(next);
    if (next) {
      const writingPath = getCurrentWritingPath(order, edits);
      const path = writingPath ?? relativePath;
      const content = (writingPath ? edits[writingPath]?.content : undefined) ?? '';
      updateAiPreview(path, content);
    }
  };

  const handleStop = () => {
    stopStreaming();
  };

  return (
    <div
      data-testid="ai-editor-header"
      style={{
        padding: '7px 14px',
        borderBottom: '1px solid rgba(0,224,255,0.18)',
        background: 'rgba(0,224,255,0.04)',
        fontSize: 11.5,
        color: 'var(--caval-text)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <span className="caval-ai-work-canvas-pulse" aria-hidden style={{ color: '#00E0FF' }}>
        ✦
      </span>
      <span style={{ fontWeight: 600, color: '#00E0FF' }}>{t('workCanvas.header.title')}</span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: 'var(--caval-text-muted)',
          flex: 1,
          minWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={relativePath}
      >
        {relativePath}
      </span>
      <span style={{ color: 'var(--caval-text-muted)', fontSize: 11 }}>{statusLabel}</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <button
          type="button"
          data-testid="ai-editor-open-file"
          onClick={handleOpenFile}
          disabled={!projectPath}
          style={headerBtnStyle}
          title={t('workCanvas.header.openFile')}
        >
          {t('workCanvas.header.openFile')}
        </button>
        <button
          type="button"
          data-testid="ai-editor-follow-toggle"
          aria-pressed={followAi}
          onClick={handleFollowToggle}
          style={{
            ...headerBtnStyle,
            borderColor: followAi ? 'rgba(0,224,255,0.45)' : 'rgba(255,255,255,0.12)',
            color: followAi ? '#00E0FF' : 'var(--caval-text-muted)',
          }}
          title={followAi ? t('workCanvas.header.followOff') : t('workCanvas.header.followOn')}
        >
          {followAi ? t('workCanvas.header.followOn') : t('workCanvas.header.followOff')}
        </button>
        {isStreaming ? (
          <button
            type="button"
            data-testid="ai-editor-stop"
            onClick={handleStop}
            style={{
              ...headerBtnStyle,
              borderColor: 'rgba(239,68,68,0.35)',
              color: '#EF4444',
            }}
            title={t('workCanvas.header.stop')}
          >
            {t('workCanvas.header.stop')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const headerBtnStyle: React.CSSProperties = {
  height: 26,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.03)',
  color: 'var(--caval-text-muted)',
  fontSize: 10.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
};
