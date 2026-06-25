import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useCavalTheme } from '../../../../themes/theme-provider';
import { useEditorStore } from '../../store/editor-store';
import { usePromptLibraryStore, CATEGORY_COLORS, type PromptStyle } from '../../store/prompt-library-store';
import { useSettingsStore } from '../../store/settings-store';

// ──────────────────────────────────────────────
//  ImagePanel — Generator imagini DALL-E 3
//  Caval IDE · Tab Activity Bar „image"
// ──────────────────────────────────────────────

type ImageSize    = '1024x1024' | '1792x1024' | '1024x1792';
type ImageQuality = 'standard' | 'hd';
type ImageStyle   = 'vivid' | 'natural';

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  revisedPrompt?: string;
  size: ImageSize;
  quality: ImageQuality;
  style: ImageStyle;
  timestamp: number;
}

// ── Constante UI ─────────────────────────────

const SIZES: { value: ImageSize; label: string; ratio: string }[] = [
  { value: '1024x1024', label: '1:1',  ratio: 'Pătrat' },
  { value: '1792x1024', label: '16:9', ratio: 'Landscape' },
  { value: '1024x1792', label: '9:16', ratio: 'Portrait' },
];

const STYLE_PRESETS = [
  'A cinematic, hyper-realistic scene of',
  'Flat vector illustration of',
  'Watercolor painting of',
  'Dark futuristic cyberpunk concept art:',
  'Minimalist line art icon of',
  'Oil painting in the style of Rembrandt:',
  'Isometric 3D render of',
];

// ── Aspect ratio vizual ───────────────────────

function SizeButton({
  item, selected, onClick,
}: {
  item: typeof SIZES[0];
  selected: boolean;
  onClick: () => void;
}) {
  const w = item.value === '1792x1024' ? 22 : item.value === '1024x1792' ? 14 : 17;
  const h = item.value === '1024x1792' ? 22 : item.value === '1792x1024' ? 14 : 17;

  return (
    <button
      onClick={onClick}
      title={`${item.value} — ${item.ratio}`}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 5, padding: '7px 10px', borderRadius: 6,
        border: `1px solid ${selected ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
        background: selected ? 'rgba(0,224,255,0.08)' : 'var(--caval-surface)',
        cursor: 'pointer', flex: 1,
        transition: 'all 0.12s',
      }}
    >
      <div style={{
        width: w, height: h,
        border: `1.5px solid ${selected ? 'var(--caval-accent)' : 'var(--caval-text-muted)'}`,
        borderRadius: 2,
        background: selected ? 'rgba(0,224,255,0.15)' : 'transparent',
        transition: 'all 0.12s',
      }} />
      <span style={{
        fontSize: 10, fontWeight: 600,
        color: selected ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {item.label}
      </span>
    </button>
  );
}

// ── Imagine generată — card preview ──────────

function ImageCard({
  img, onSaveAs, onSaveToProject, projectPath,
}: {
  img: GeneratedImage;
  onSaveAs: (url: string) => void;
  onSaveToProject: (url: string, prompt: string) => void;
  projectPath: string | null;
}) {
  const [showRevised, setShowRevised] = useState(false);
  const [copying, setCopying] = useState(false);

  const aspectRatio =
    img.size === '1792x1024' ? '16/9' :
    img.size === '1024x1792' ? '9/16' : '1/1';

  const copyUrl = async () => {
    await navigator.clipboard.writeText(img.url);
    setCopying(true);
    setTimeout(() => setCopying(false), 1500);
  };

  const relTime = (() => {
    const diff = Date.now() - img.timestamp;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'acum';
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  })();

  return (
    <div style={{
      background: 'var(--caval-surface)',
      border: '1px solid var(--caval-border)',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      {/* Preview imagine */}
      <div style={{
        aspectRatio,
        width: '100%',
        background: 'var(--caval-bg)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <img
          src={img.url}
          alt={img.prompt}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="lazy"
        />
        {/* Overlay cu acțiuni */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(14,14,15,0.85) 0%, transparent 50%)',
          display: 'flex', alignItems: 'flex-end',
          padding: 10, gap: 6,
          opacity: 0,
          transition: 'opacity 0.15s',
        }}
          className="img-overlay"
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
        >
          <ImgAction title="Copiază URL" onClick={copyUrl}>
            {copying ? '✓' : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="4" y="4" width="9" height="9" rx="1" /><path d="M3 12H2a1 1 0 01-1-1V2a1 1 0 011-1h9a1 1 0 011 1v1" />
              </svg>
            )}
          </ImgAction>
          <ImgAction title="Salvează ca…" onClick={() => onSaveAs(img.url)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 2v9M4 8l4 4 4-4" strokeLinecap="round" /><path d="M2 14h12" />
            </svg>
          </ImgAction>
          {projectPath && (
            <ImgAction title="Salvează în proiect (assets/)" onClick={() => onSaveToProject(img.url, img.prompt)} accent>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 4a1 1 0 011-1h4l2 2h4a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
              </svg>
            </ImgAction>
          )}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '8px 10px' }}>
        {/* Prompt */}
        <div
          style={{
            fontSize: 11.5, color: 'var(--caval-text)', lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
            cursor: img.revisedPrompt ? 'pointer' : 'default',
          }}
          title={showRevised ? img.revisedPrompt : img.prompt}
          onClick={() => img.revisedPrompt && setShowRevised((v) => !v)}
        >
          {showRevised && img.revisedPrompt ? img.revisedPrompt : img.prompt}
        </div>
        {img.revisedPrompt && (
          <button
            onClick={() => setShowRevised((v) => !v)}
            style={{
              marginTop: 3, fontSize: 10, background: 'none', border: 'none',
              color: 'var(--caval-accent)', cursor: 'pointer', padding: 0,
            }}
          >
            {showRevised ? '← prompt original' : 'prompt revizuit →'}
          </button>
        )}

        {/* Metadata */}
        <div style={{
          display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <MetaBadge>{img.size}</MetaBadge>
          <MetaBadge>{img.quality}</MetaBadge>
          <MetaBadge>{img.style}</MetaBadge>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--caval-text-muted)' }}>
            {relTime}
          </span>
        </div>
      </div>
    </div>
  );
}

function ImgAction({
  title, onClick, children, accent,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 5,
        background: accent ? 'var(--caval-accent)' : 'rgba(14,14,15,0.7)',
        border: `1px solid ${accent ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
        color: accent ? '#0E0E0F' : '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700,
        backdropFilter: 'blur(4px)',
      }}
    >
      {children}
    </button>
  );
}

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9.5, padding: '1px 5px', borderRadius: 3,
      background: 'rgba(255,255,255,0.05)',
      color: 'var(--caval-text-muted)',
      fontFamily: "'JetBrains Mono', monospace",
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {children}
    </span>
  );
}

// ──────────────────────────────────────────────
//  ImagePanel — componenta principală
// ──────────────────────────────────────────────

export function ImagePanel() {
  const { theme } = useCavalTheme();
  const projectPath = useEditorStore((s) => s.projectPath);

  // ── Setări persistate în localStorage ────────
  const [apiKey, setApiKey]         = useState(() => localStorage.getItem('caval_dalle_key') || '');
  const [showKey, setShowKey]       = useState(false);
  const [size, setSize]             = useState<ImageSize>('1024x1024');
  const [quality, setQuality]       = useState<ImageQuality>('standard');
  const [style, setStyle]           = useState<ImageStyle>('vivid');

  // ── State generare ────────────────────────────
  const [prompt, setPrompt]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [saveMsg, setSaveMsg]       = useState<string | null>(null);

  // ── Istoric sesiune ───────────────────────────
  const [images, setImages]         = useState<GeneratedImage[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Prompt Library integration ───────────────────────
  const { styles, composePrompt, incrementUsage } = usePromptLibraryStore();
  const { contextBridge, safety } = useSettingsStore();
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [subjectInput, setSubjectInput] = useState('');

  const activeStyle = styles.find(s => s.id === activeStyleId) ?? null;

  // Când se selectează un stil, compune promptul automat
  const applyStyle = useCallback((style: PromptStyle | null) => {
    setActiveStyleId(style?.id ?? null);
    setShowStylePicker(false);
    if (style && subjectInput.trim()) {
      const composed = composePrompt(style.id, subjectInput);
      setPrompt(composed);
    }
  }, [subjectInput, composePrompt]);

  // Recalculează promptul când subiectul se schimbă și e selectat un stil
  const handleSubjectChange = useCallback((val: string) => {
    setSubjectInput(val);
    if (activeStyleId) {
      const composed = composePrompt(activeStyleId, val);
      setPrompt(composed);
    } else {
      setPrompt(val);
    }
  }, [activeStyleId, composePrompt]);

  // Aplică modificatori de siguranță din Settings
  const buildFinalPrompt = useCallback((basePrompt: string): string => {
    let final = basePrompt.trim();
    if (safety.requireTransparentBg) {
      final += '. Transparent background, PNG format.';
    }
    if (safety.addDarkModeNote) {
      final += ' Works well on both dark and light backgrounds.';
    }
    if (contextBridge.enabled && contextBridge.customInstructions.trim()) {
      final += ' ' + contextBridge.customInstructions.trim();
    }
    if (contextBridge.enabled && contextBridge.analyzeColors && contextBridge.detectedColors.length > 0) {
      const topColors = contextBridge.detectedColors.slice(0, 5).join(', ');
      final += ' Use project colors: ' + topColors + '.';
    }
    return final;
  }, [safety, contextBridge]);

  // Salvează cheia în localStorage la modificare
  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    localStorage.setItem('caval_dalle_key', val);
  };

  // ── Generate ──────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { setError('Scrie un prompt.'); return; }
    if (!apiKey.trim()) { setError('Adaugă cheia API OpenAI mai sus.'); return; }

    setLoading(true);
    setError(null);

    const finalPrompt = buildFinalPrompt(prompt);
    const genSize = (activeStyle?.overrideSize ?? size) as ImageSize;
    const genQuality = activeStyle?.overrideQuality ?? quality;
    const genStyle = activeStyle?.overrideStyle ?? style;

    const result = await window.caval.image.generate({ prompt: finalPrompt, size: genSize, quality: genQuality, style: genStyle, apiKey });

    if (!result.ok || !result.url) {
      setError(result.error || 'Eroare necunoscută la generare.');
      setLoading(false);
      return;
    }

    const newImg: GeneratedImage = {
      id: `img_${Date.now()}`,
      url: result.url,
      prompt,
      revisedPrompt: result.revisedPrompt,
      size, quality, style,
      timestamp: Date.now(),
    };

    setImages((prev) => [newImg, ...prev]);
    if (activeStyleId) incrementUsage(activeStyleId);
    setLoading(false);
  }, [prompt, size, quality, style, apiKey, buildFinalPrompt, activeStyle, activeStyleId, incrementUsage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  };

  // ── Save ──────────────────────────────────────
  const handleSaveAs = async (url: string) => {
    const result = await window.caval.image.saveAs(url);
    if (result.ok) {
      setSaveMsg(`Salvată: ${result.savedPath?.split(/[\\/]/).pop()}`);
    } else {
      setSaveMsg(result.error || 'Eroare la salvare.');
    }
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleSaveToProject = async (url: string, imgPrompt: string) => {
    if (!projectPath) { setSaveMsg('Deschide un proiect mai întâi.'); return; }
    const slug = imgPrompt.trim().split(' ').slice(0, 5).join('-').replace(/[^a-z0-9\-]/gi, '');
    const result = await window.caval.image.save(url, projectPath, slug);
    if (result.ok) {
      setSaveMsg(`Salvată în assets/ → ${result.savedPath?.split(/[\\/]/).pop()}`);
    } else {
      setSaveMsg(result.error || 'Eroare la salvare.');
    }
    setTimeout(() => setSaveMsg(null), 3500);
  };

  // ── Inject preset în textarea ─────────────────
  const applyPreset = (preset: string) => {
    setPrompt(preset + ' ');
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      background: 'var(--caval-bg)',
    }}>

      {/* ── Header ─────────────────────────── */}
      <div style={{
        padding: '11px 14px 10px',
        borderBottom: '1px solid var(--caval-border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {/* Icon DALL-E */}
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'linear-gradient(135deg, #00E0FF22, #7C3AED22)',
            border: '1px solid rgba(0,224,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--caval-accent)" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="var(--caval-accent)" />
              <path d="M21 15l-5-5L5 21" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--caval-text)' }}>
              Image Generator
            </div>
            <div style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>
              DALL-E 3 · OpenAI
            </div>
          </div>
          {/* Badge imagini generate */}
          {images.length > 0 && (
            <span style={{
              marginLeft: 'auto', fontSize: 10, fontWeight: 600,
              padding: '2px 7px', borderRadius: 99,
              background: 'rgba(0,224,255,0.08)',
              border: '1px solid rgba(0,224,255,0.15)',
              color: 'var(--caval-accent)',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {images.length} {images.length === 1 ? 'imagine' : 'imagini'}
            </span>
          )}
        </div>

        {/* API Key */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, color: 'var(--caval-text-muted)', display: 'block', marginBottom: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            OpenAI API Key
          </label>
          <div style={{ display: 'flex', gap: 5 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="sk-..."
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 5,
                background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
                color: 'var(--caval-text)', fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace", outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(0,224,255,0.4)'; }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--caval-border)'; }}
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              title={showKey ? 'Ascunde' : 'Arată'}
              style={{
                width: 28, height: 28, borderRadius: 5,
                background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
                color: 'var(--caval-text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {showKey ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2 8s3-5 6-5 6 5 6 5-3 5-6 5-6-5-6-5z" />
                  <path d="M3 3l10 10" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2 8s3-5 6-5 6 5 6 5-3 5-6 5-6-5-6-5z" />
                  <circle cx="8" cy="8" r="1.5" />
                </svg>
              )}
            </button>
          </div>
          {!apiKey && (
            <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', marginTop: 3 }}>
              Obține cheia la{' '}
              <span
                style={{ color: 'var(--caval-accent)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { /* electron shell.openExternal */ }}
              >
                platform.openai.com/api-keys
              </span>
            </div>
          )}
        </div>

        {/* Size */}
        <div style={{ marginBottom: 9 }}>
          <label style={{ fontSize: 10, color: 'var(--caval-text-muted)', display: 'block', marginBottom: 5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Dimensiune
          </label>
          <div style={{ display: 'flex', gap: 5 }}>
            {SIZES.map((s) => (
              <SizeButton
                key={s.value}
                item={s}
                selected={size === s.value}
                onClick={() => setSize(s.value)}
              />
            ))}
          </div>
        </div>

        {/* Quality + Style */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, color: 'var(--caval-text-muted)', display: 'block', marginBottom: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Calitate
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['standard', 'hd'] as const).map((q) => (
                <ToggleChip
                  key={q}
                  selected={quality === q}
                  onClick={() => setQuality(q)}
                  label={q === 'hd' ? 'HD' : 'Standard'}
                  sublabel={q === 'hd' ? '$0.08' : '$0.04'}
                />
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, color: 'var(--caval-text-muted)', display: 'block', marginBottom: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Stil
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['vivid', 'natural'] as const).map((st) => (
                <ToggleChip
                  key={st}
                  selected={style === st}
                  onClick={() => setStyle(st)}
                  label={st === 'vivid' ? 'Vivid' : 'Natural'}
                  sublabel={st === 'vivid' ? 'dramatic' : 'realist'}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Prompt + presets + buton generate ── */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--caval-border)',
        flexShrink: 0,
      }}>
        {/* ── Style Picker (Prompt Library) ──── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--caval-text-muted)' }}>
              Stil
            </span>
            {activeStyle && (
              <button
                onClick={() => applyStyle(null)}
                title="Elimină stilul"
                style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 3, border: 'none',
                  background: 'rgba(239,68,68,0.1)', color: '#EF4444', cursor: 'pointer' }}
              >
                ✕ elimină
              </button>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            {/* Buton selector stil curent */}
            <button
              onClick={() => setShowStylePicker(v => !v)}
              style={{
                width: '100%', padding: '6px 10px',
                borderRadius: 6, cursor: 'pointer',
                background: activeStyle ? 'rgba(0,224,255,0.05)' : 'var(--caval-surface)',
                border: `1px solid ${activeStyle ? 'rgba(0,224,255,0.25)' : 'var(--caval-border)'}`,
                color: activeStyle ? 'var(--caval-text)' : 'var(--caval-text-muted)',
                display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, textAlign: 'left',
                transition: 'all 0.12s',
              }}
            >
              {activeStyle ? (
                <>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: CATEGORY_COLORS[activeStyle.category] ?? '#8A95A6',
                    boxShadow: `0 0 5px ${CATEGORY_COLORS[activeStyle.category] ?? '#8A95A6'}60`,
                  }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {activeStyle.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--caval-text-muted)', flexShrink: 0 }}>▾</span>
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round"/>
                  </svg>
                  <span style={{ flex: 1 }}>Fără stil — alege din Prompt Library</span>
                  <span style={{ fontSize: 10, flexShrink: 0 }}>▾</span>
                </>
              )}
            </button>

            {/* Dropdown picker */}
            {showStylePicker && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 499 }} onClick={() => setShowStylePicker(false)} />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
                  borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                  zIndex: 500, marginTop: 4, maxHeight: 280, overflowY: 'auto',
                }}
                  className="ai-messages-scroll"
                >
                  {/* Fără stil */}
                  <button
                    onClick={() => applyStyle(null)}
                    style={{
                      width: '100%', padding: '8px 12px', border: 'none', textAlign: 'left',
                      background: !activeStyleId ? 'rgba(0,224,255,0.06)' : 'transparent',
                      color: !activeStyleId ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
                      cursor: 'pointer', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                    onMouseEnter={e => { if (activeStyleId) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (activeStyleId) e.currentTarget.style.background = 'transparent'; }}
                  >
                    Fără stil (prompt liber)
                  </button>
                  {/* Stiluri disponibile */}
                  {styles.map(s => (
                    <button
                      key={s.id}
                      onClick={() => applyStyle(s)}
                      style={{
                        width: '100%', padding: '7px 12px', border: 'none', textAlign: 'left',
                        background: activeStyleId === s.id ? 'rgba(0,224,255,0.06)' : 'transparent',
                        color: 'var(--caval-text)', cursor: 'pointer', fontSize: 12,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={e => { if (activeStyleId !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={e => { if (activeStyleId !== s.id) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: CATEGORY_COLORS[s.category] ?? '#8A95A6',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: activeStyleId === s.id ? 600 : 400 }}>
                          {s.name}
                          {s.favorite && <span style={{ marginLeft: 4, color: '#D4A857', fontSize: 10 }}>★</span>}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Câmp subiect — vizibil când e selectat un stil */}
          {activeStyle && (
            <div style={{ marginTop: 7 }}>
              <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Subiect
              </div>
              <input
                value={subjectInput}
                onChange={e => handleSubjectChange(e.target.value)}
                placeholder={activeStyle.exampleSubject ? `ex: ${activeStyle.exampleSubject}` : 'Descrie subiectul…'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
                  borderRadius: 5, padding: '5px 9px',
                  color: 'var(--caval-text)', fontSize: 12, outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(0,224,255,0.4)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--caval-border)'; }}
              />
              <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                Promptul final: <span style={{ color: 'rgba(0,224,255,0.7)' }}>
                  {activeStyle.prefix.trim().substring(0, 30)}… <strong style={{ color: 'var(--caval-accent)' }}>{subjectInput || '‹subiect›'}</strong> …{activeStyle.suffix.trim().substring(0, 20)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Presets rapide */}
        <div style={{
          display: 'flex', gap: 4, flexWrap: 'nowrap', overflowX: 'auto',
          marginBottom: 7, paddingBottom: 2,
        }}
          className="ai-messages-scroll"
        >
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => applyPreset(preset)}
              style={{
                flexShrink: 0,
                padding: '3px 8px', borderRadius: 99, fontSize: 10.5,
                background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
                color: 'var(--caval-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,224,255,0.3)';
                e.currentTarget.style.color = 'var(--caval-text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--caval-border)';
                e.currentTarget.style.color = 'var(--caval-text-muted)';
              }}
            >
              {preset.replace(/^(A |An )/, '').split(' ').slice(0, 3).join(' ')}…
            </button>
          ))}
        </div>

        {/* Textarea prompt */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Descrie imaginea… (Ctrl+Enter = generează)"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
            borderRadius: 6, padding: '7px 9px',
            color: 'var(--caval-text)', fontSize: 12.5,
            fontFamily: "'Inter', sans-serif", resize: 'none', outline: 'none',
            lineHeight: 1.55,
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(0,224,255,0.4)'; }}
          onBlur={(e)  => { e.target.style.borderColor = 'var(--caval-border)'; }}
        />

        {/* Eroare */}
        {error && (
          <div style={{
            marginTop: 5, padding: '5px 8px', borderRadius: 5,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)',
            color: '#EF4444', fontSize: 11.5,
          }}>
            {error}
          </div>
        )}

        {/* Save toast */}
        {saveMsg && (
          <div style={{
            marginTop: 5, padding: '5px 8px', borderRadius: 5,
            background: 'rgba(47,191,113,0.08)', border: '1px solid rgba(47,191,113,0.18)',
            color: '#2FBF71', fontSize: 11.5,
          }}>
            {saveMsg}
          </div>
        )}

        {/* Buton Generate */}
        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          style={{
            width: '100%', marginTop: 7, padding: '8px 0',
            borderRadius: 6, border: 'none',
            background: loading
              ? 'rgba(0,224,255,0.1)'
              : prompt.trim()
                ? 'linear-gradient(135deg, rgba(0,224,255,0.9), rgba(0,160,200,0.9))'
                : 'rgba(255,255,255,0.07)',
            color: loading
              ? 'var(--caval-accent)'
              : prompt.trim() ? '#0E0E0F' : 'var(--caval-text-muted)',
            fontWeight: 700, fontSize: 13,
            cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          {loading ? (
            <>
              <span style={{ animation: 'caval-spin 1s linear infinite', display: 'inline-block' }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 8A6 6 0 112 8" strokeLinecap="round" />
                </svg>
              </span>
              Generez cu DALL-E 3…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Generează imagine
            </>
          )}
        </button>
      </div>

      {/* ── Galerie imagini generate ─────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}
        className="ai-messages-scroll"
      >
        {images.length === 0 ? (
          <EmptyGallery />
        ) : (
          images.map((img) => (
            <ImageCard
              key={img.id}
              img={img}
              onSaveAs={handleSaveAs}
              onSaveToProject={handleSaveToProject}
              projectPath={projectPath}
            />
          ))
        )}
      </div>

    </div>
  );
}

// ──────────────────────────────────────────────
//  Sub-componente
// ──────────────────────────────────────────────

function ToggleChip({
  selected, onClick, label, sublabel,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '4px 6px', borderRadius: 5,
        border: `1px solid ${selected ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
        background: selected ? 'rgba(0,224,255,0.08)' : 'var(--caval-surface)',
        cursor: 'pointer', transition: 'all 0.12s',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      }}
    >
      <span style={{ fontSize: 11.5, fontWeight: 600, color: selected ? 'var(--caval-accent)' : 'var(--caval-text)' }}>
        {label}
      </span>
      {sublabel && (
        <span style={{ fontSize: 9, color: 'var(--caval-text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
          {sublabel}
        </span>
      )}
    </button>
  );
}

function EmptyGallery() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 12, padding: 24, textAlign: 'center',
    }}>
      {/* Placeholder vizual — grid de pătrate */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, opacity: 0.15 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{
            width: 52, height: 52, borderRadius: 6,
            background: 'linear-gradient(135deg, rgba(0,224,255,0.3), rgba(124,58,237,0.3))',
            border: '1px solid rgba(0,224,255,0.2)',
          }} />
        ))}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--caval-text)', marginTop: 4 }}>
        Nicio imagine generată
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', lineHeight: 1.5, maxWidth: 200 }}>
        Scrie un prompt și apasă Generează.<br />
        Imaginile apar aici în galerie.
      </div>
    </div>
  );
}
