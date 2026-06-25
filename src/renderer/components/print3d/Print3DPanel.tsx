import React, { useEffect, useRef } from 'react';
import { CadViewer } from '../engineering/CadViewer';
import { usePrint3DStore, exampleChips } from '../../store/print3d-store';
import { statusLabel, t } from '../../store/print3d-i18n';

export function Print3DPanel() {
  const {
    messages,
    input,
    quality,
    userLanguage,
    isGenerating,
    isPlanning,
    viewer,
    setInput,
    setQuality,
    sendMessage,
    stopGeneration,
    clearChat,
    downloadStl,
    exportScad,
  } = usePrint3DStore();

  const lang = userLanguage;
  const busy = isGenerating || isPlanning;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, isPlanning]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    void sendMessage();
  };

  const chips = exampleChips(lang);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--caval-bg)',
    }}>
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--caval-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--caval-text)' }}>
            {t('panelTitle', lang)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', marginTop: 2 }}>
            {t('panelSubtitle', lang)}
          </div>
        </div>
        <button
          type="button"
          onClick={clearChat}
          disabled={busy}
          style={{
            padding: '5px 10px',
            borderRadius: 5,
            border: '1px solid var(--caval-border)',
            background: 'transparent',
            color: 'var(--caval-text-muted)',
            fontSize: 11,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {t('clearChat', lang)}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{
          width: 380,
          flexShrink: 0,
          borderRight: '1px solid var(--caval-border)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <div
            className="ai-messages-scroll"
            style={{ flex: 1, overflowY: 'auto', padding: 14 }}
          >
            {messages.length === 0 && (
              <div style={{
                fontSize: 12,
                color: 'var(--caval-text-muted)',
                lineHeight: 1.6,
                padding: '8px 4px',
              }}>
                <div style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                  {t('emptyState', lang)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      disabled={busy}
                      onClick={() => void sendMessage(chip)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--caval-border)',
                        background: 'var(--caval-surface)',
                        color: 'var(--caval-text-muted)',
                        fontSize: 11,
                        cursor: busy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${msg.role === 'user' ? 'var(--caval-border)' : msg.kind === 'consultation' ? 'var(--caval-border)' : 'rgba(0,224,255,0.2)'}`,
                  background: msg.role === 'user'
                    ? 'var(--caval-surface)'
                    : msg.kind === 'consultation'
                      ? 'var(--caval-surface)'
                      : 'rgba(0,224,255,0.06)',
                }}
              >
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: msg.role === 'user' ? 'var(--caval-text-muted)' : 'var(--caval-accent)',
                  marginBottom: 6,
                }}>
                  {msg.role === 'user' ? t('userLabel', lang) : t('assistantLabel', lang)}
                  {msg.status && msg.status !== 'done' && isGenerating && msg.kind === 'generation'
                    ? ` · ${statusLabel(msg.status, lang, msg.generationMode)}`
                    : ''}
                </div>
                <div style={{
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: 'var(--caval-text)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
                {msg.quickReplies && msg.quickReplies.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {msg.quickReplies.map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        disabled={busy}
                        onClick={() => void sendMessage(reply)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 6,
                          border: '1px solid rgba(0,224,255,0.35)',
                          background: 'rgba(0,224,255,0.08)',
                          color: 'var(--caval-accent)',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: busy ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
                {msg.dimensions && (
                  <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', marginTop: 6 }}>
                    {t('dimensions', lang)}: {msg.dimensions.x} × {msg.dimensions.y} × {msg.dimensions.z} mm
                  </div>
                )}
              </div>
            ))}
            {isPlanning && (
              <div style={{
                fontSize: 12,
                color: 'var(--caval-text-muted)',
                fontStyle: 'italic',
                padding: '4px 0',
              }}>
                {t('statusPlanning', lang)}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              padding: 12,
              borderTop: '1px solid var(--caval-border)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', fontWeight: 600 }}>
                {t('quality', lang)}
              </label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as 'standard' | 'high')}
                disabled={busy}
                style={{
                  flex: 1,
                  background: 'var(--caval-surface)',
                  border: '1px solid var(--caval-border)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  color: 'var(--caval-text)',
                  fontSize: 12,
                }}
              >
                <option value="standard">{t('qualityStandard', lang)}</option>
                <option value="high">{t('qualityHigh', lang)}</option>
              </select>
            </div>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('placeholder', lang)}
              rows={3}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--caval-surface)',
                border: '1px solid var(--caval-border)',
                borderRadius: 8,
                padding: '10px 12px',
                color: 'var(--caval-text)',
                fontSize: 12.5,
                lineHeight: 1.5,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                marginBottom: 8,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                disabled={busy || !input.trim()}
                style={{
                  flex: 1,
                  padding: '9px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: busy ? 'rgba(0,224,255,0.3)' : 'var(--caval-accent)',
                  color: '#0E0E0F',
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
                  opacity: !input.trim() ? 0.5 : 1,
                }}
              >
                {busy ? t('generatingBtn', lang) : t('generateBtn', lang)}
              </button>
              {isGenerating && (
                <button
                  type="button"
                  onClick={stopGeneration}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--caval-border)',
                    background: 'transparent',
                    color: 'var(--caval-text-muted)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {t('stop', lang)}
                </button>
              )}
            </div>
          </form>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--caval-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}>
            {viewer.status && (
              <span style={{ fontSize: 11.5, color: 'var(--caval-accent)', fontWeight: 600 }}>
                {statusLabel(viewer.status, lang, viewer.generationMode)}
              </span>
            )}
            {viewer.dimensions && (
              <span style={{ fontSize: 11, color: 'var(--caval-text-muted)' }}>
                {viewer.dimensions.x} × {viewer.dimensions.y} × {viewer.dimensions.z} mm
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {viewer.scad && viewer.generationMode !== 'mesh' && (
                <button
                  type="button"
                  onClick={() => void exportScad()}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 5,
                    border: '1px solid var(--caval-border)',
                    background: 'var(--caval-surface)',
                    color: 'var(--caval-text)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t('exportScad', lang)}
                </button>
              )}
              {viewer.stlUrl && (
                <button
                  type="button"
                  onClick={() => void downloadStl()}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 5,
                    border: '1px solid var(--caval-border)',
                    background: 'var(--caval-surface)',
                    color: 'var(--caval-text)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t('downloadStl', lang)}
                </button>
              )}
            </div>
          </div>

          {viewer.error && (
            <div style={{
              padding: '8px 14px',
              fontSize: 11.5,
              color: '#FF8080',
              borderBottom: '1px solid var(--caval-border)',
              background: 'rgba(239,68,68,0.08)',
            }}>
              {viewer.error}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <CadViewer stlUrl={viewer.stlUrl} />
            {isGenerating && viewer.status !== 'done' && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(10,10,11,0.55)',
                pointerEvents: 'none',
              }}>
                <div style={{
                  padding: '12px 18px',
                  borderRadius: 8,
                  border: '1px solid var(--caval-border)',
                  background: 'var(--caval-surface)',
                  color: 'var(--caval-accent)',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {viewer.status
                    ? statusLabel(viewer.status, lang, viewer.generationMode)
                    : t('statusStarting', lang)}
                </div>
              </div>
            )}
          </div>

          {viewer.scad && viewer.generationMode !== 'mesh' && (
            <details style={{
              borderTop: '1px solid var(--caval-border)',
              flexShrink: 0,
              maxHeight: 160,
              overflow: 'auto',
            }}>
              <summary style={{
                padding: '8px 14px',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--caval-text-muted)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {t('scadSource', lang)}
              </summary>
              <pre style={{
                margin: 0,
                padding: '10px 14px',
                fontSize: 11,
                lineHeight: 1.45,
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--caval-text)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {viewer.scad}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
