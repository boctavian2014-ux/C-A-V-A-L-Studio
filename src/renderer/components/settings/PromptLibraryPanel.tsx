import React, { useState, useRef, useEffect } from 'react';
import {
  usePromptLibraryStore,
  type PromptStyle,
  type StyleCategory,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
} from '../../store/prompt-library-store';

// ──────────────────────────────────────────────
//  PromptLibraryPanel — CAVALLO Studio
//  Editor stiluri predefinite pentru Image Generator.
//  Afișat ca secțiune în SettingsPanel.
// ──────────────────────────────────────────────

// ── Category pill ─────────────────────────────

function CategoryPill({
  category, selected, count, onClick,
}: {
  category: StyleCategory | 'all' | 'favorites';
  selected: boolean;
  count?: number;
  onClick: () => void;
}) {
  const color = category === 'all' || category === 'favorites'
    ? '#00E0FF'
    : CATEGORY_COLORS[category as StyleCategory] ?? '#8A95A6';

  const label = category === 'all'
    ? 'Toate'
    : category === 'favorites'
    ? '★ Favorite'
    : CATEGORY_LABELS[category as StyleCategory];

  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 500,
        border: `1px solid ${selected ? color : 'var(--caval-border)'}`,
        background: selected ? `${color}18` : 'transparent',
        color: selected ? color : 'var(--caval-text-muted)',
        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        transition: 'all 0.12s',
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: 9.5, fontWeight: 700,
          background: selected ? `${color}30` : 'rgba(255,255,255,0.07)',
          padding: '0 4px', borderRadius: 99,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Style Card (în lista din stânga) ──────────

function StyleCard({
  style, isSelected, onSelect, onFavorite, onDuplicate, onDelete, onEdit,
}: {
  style: PromptStyle;
  isSelected: boolean;
  onSelect: () => void;
  onFavorite: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isBuiltin = style.id.startsWith('builtin_');
  const catColor = CATEGORY_COLORS[style.category] ?? '#8A95A6';

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '9px 10px',
        borderRadius: 7,
        border: `1px solid ${isSelected ? 'rgba(0,224,255,0.3)' : 'var(--caval-border)'}`,
        background: isSelected
          ? 'rgba(0,224,255,0.05)'
          : hovered ? 'var(--caval-surface)' : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.12s',
        marginBottom: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Category color dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: catColor, flexShrink: 0, marginTop: 4,
          boxShadow: isSelected ? `0 0 6px ${catColor}80` : 'none',
        }} />

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{
              fontSize: 12.5, fontWeight: 600, color: 'var(--caval-text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {style.name}
            </span>
            {style.favorite && (
              <span style={{ color: '#D4A857', fontSize: 11, flexShrink: 0 }}>★</span>
            )}
            {isBuiltin && (
              <span style={{
                fontSize: 8.5, padding: '1px 4px', borderRadius: 3,
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--caval-text-muted)', flexShrink: 0,
              }}>
                built-in
              </span>
            )}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--caval-text-muted)', lineHeight: 1.35,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {style.description}
          </div>
          {style.usageCount > 0 && (
            <div style={{ fontSize: 9.5, color: 'var(--caval-text-muted)', marginTop: 3, opacity: 0.7 }}>
              Folosit de {style.usageCount} {style.usageCount === 1 ? 'oară' : 'ori'}
            </div>
          )}
        </div>

        {/* Actions — vizibile la hover/selected */}
        {(hovered || isSelected) && (
          <div
            style={{ display: 'flex', gap: 2, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconBtn title="Editează" onClick={onEdit}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M11.7 2.3a1 1 0 011.4 1.4L4 13l-3 .5.5-3L11.7 2.3z" strokeLinejoin="round" />
              </svg>
            </IconBtn>
            <IconBtn title={style.favorite ? 'Elimină din favorite' : 'Adaugă la favorite'} onClick={onFavorite} gold={style.favorite}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill={style.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                <path d="M8 1.5l1.9 3.9L14 6.1l-3 2.9.7 4.1L8 11.2l-3.7 1.9.7-4.1L2 6.1l4.1-.7L8 1.5z" strokeLinejoin="round" />
              </svg>
            </IconBtn>
            <IconBtn title="Duplică" onClick={onDuplicate}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="5" width="8" height="8" rx="1" />
                <path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1" />
              </svg>
            </IconBtn>
            {!isBuiltin && (
              <IconBtn title="Șterge" onClick={onDelete} danger>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" strokeLinecap="round" />
                </svg>
              </IconBtn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  title, onClick, children, danger, gold,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  gold?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 22, height: 22, borderRadius: 4, border: 'none',
        background: 'none', cursor: 'pointer',
        color: danger ? '#EF4444' : gold ? '#D4A857' : 'var(--caval-text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      {children}
    </button>
  );
}

// ── Style Editor (form în dreapta) ────────────

const STYLE_CATEGORIES: { value: StyleCategory; label: string }[] = [
  { value: 'ui-icons',      label: 'UI Icons' },
  { value: 'illustrations', label: 'Ilustrații' },
  { value: 'marketing',     label: 'Marketing' },
  { value: 'app-assets',    label: 'App Assets' },
  { value: 'photography',   label: 'Fotografie' },
  { value: 'custom',        label: 'Custom' },
];

function StyleEditor({
  style,
  onSave,
  onCancel,
  isNew,
}: {
  style: PromptStyle;
  onSave: (patch: Partial<PromptStyle>) => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [name,           setName]           = useState(style.name);
  const [description,    setDescription]    = useState(style.description);
  const [category,       setCategory]       = useState<StyleCategory>(style.category);
  const [prefix,         setPrefix]         = useState(style.prefix);
  const [suffix,         setSuffix]         = useState(style.suffix);
  const [exampleSubject, setExampleSubject] = useState(style.exampleSubject);
  const [overrideSize,   setOverrideSize]   = useState(style.overrideSize ?? '');
  const [overrideQuality,setOverrideQuality]= useState(style.overrideQuality ?? '');
  const [overrideStyle,  setOverrideStyle]  = useState(style.overrideStyle ?? '');

  const isBuiltin = style.id.startsWith('builtin_');

  // Preview prompt compus în timp real
  const preview = [
    prefix.trim(),
    exampleSubject.trim() || '‹subiect›',
    suffix.trim(),
  ].filter(Boolean).join(' ');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      category,
      prefix: prefix.trim(),
      suffix: suffix.trim(),
      exampleSubject: exampleSubject.trim(),
      overrideSize:    overrideSize    ? overrideSize    as any : undefined,
      overrideQuality: overrideQuality ? overrideQuality as any : undefined,
      overrideStyle:   overrideStyle   ? overrideStyle   as any : undefined,
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--caval-bg)', border: '1px solid var(--caval-border)',
    borderRadius: 5, padding: '6px 9px',
    color: 'var(--caval-text)', fontSize: 12, outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: 'var(--caval-text-muted)',
    display: 'block', marginBottom: 4,
  };

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'rgba(0,224,255,0.4)';
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--caval-border)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: CATEGORY_COLORS[category],
          boxShadow: `0 0 8px ${CATEGORY_COLORS[category]}60`,
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--caval-text)' }}>
          {isNew ? 'Stil nou' : `Editează: ${style.name}`}
        </span>
        {isBuiltin && (
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 3,
            background: 'rgba(255,255,255,0.05)', color: 'var(--caval-text-muted)',
          }}>
            built-in · se poate edita
          </span>
        )}
      </div>

      {/* Câmpuri de bază */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Nume stil *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: UI Icon Minimalist"
            style={inputStyle}
            onFocus={focusStyle} onBlur={blurStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Categorie</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as StyleCategory)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            onFocus={focusStyle} onBlur={blurStyle}
          >
            {STYLE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Descriere scurtă</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ce face acest stil?"
          style={inputStyle}
          onFocus={focusStyle} onBlur={blurStyle}
        />
      </div>

      {/* PREFIX */}
      <div>
        <label style={labelStyle}>
          Prefix prompt
          <span style={{ marginLeft: 5, textTransform: 'none', fontWeight: 400, opacity: 0.7 }}>
            — adăugat ÎNAINTE de subiect
          </span>
        </label>
        <textarea
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="ex: Flat design vector icon, white background, minimal, clean lines,"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          onFocus={focusStyle} onBlur={blurStyle}
        />
      </div>

      {/* SUFFIX */}
      <div>
        <label style={labelStyle}>
          Suffix prompt
          <span style={{ marginLeft: 5, textTransform: 'none', fontWeight: 400, opacity: 0.7 }}>
            — adăugat DUPĂ subiect
          </span>
        </label>
        <textarea
          value={suffix}
          onChange={(e) => setSuffix(e.target.value)}
          placeholder="ex: . No text, no shadows, centered composition."
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          onFocus={focusStyle} onBlur={blurStyle}
        />
      </div>

      {/* DALL-E Overrides */}
      <div>
        <label style={labelStyle}>Parametri DALL-E (opțional override)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            {
              label: 'Size', value: overrideSize, setter: setOverrideSize,
              options: [
                { value: '',            label: '— default —' },
                { value: '1024x1024',   label: '1:1 · 1024×1024' },
                { value: '1792x1024',   label: '16:9 · 1792×1024' },
                { value: '1024x1792',   label: '9:16 · 1024×1792' },
              ],
            },
            {
              label: 'Quality', value: overrideQuality, setter: setOverrideQuality,
              options: [
                { value: '',         label: '— default —' },
                { value: 'standard', label: 'Standard' },
                { value: 'hd',       label: 'HD' },
              ],
            },
            {
              label: 'Style', value: overrideStyle, setter: setOverrideStyle,
              options: [
                { value: '',        label: '— default —' },
                { value: 'vivid',   label: 'Vivid' },
                { value: 'natural', label: 'Natural' },
              ],
            },
          ].map(({ label, value, setter, options }) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{ fontSize: 9.5, color: 'var(--caval-text-muted)', marginBottom: 3 }}>{label}</div>
              <select
                value={value}
                onChange={(e) => setter(e.target.value)}
                style={{ ...inputStyle, fontSize: 11 }}
                onFocus={focusStyle} onBlur={blurStyle}
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Subiect exemplu pentru preview */}
      <div>
        <label style={labelStyle}>Subiect exemplu (pentru preview)</label>
        <input
          value={exampleSubject}
          onChange={(e) => setExampleSubject(e.target.value)}
          placeholder="ex: settings gear icon"
          style={inputStyle}
          onFocus={focusStyle} onBlur={blurStyle}
        />
      </div>

      {/* ── Preview prompt compus ──────────── */}
      <div style={{
        padding: '10px 12px', borderRadius: 7,
        background: 'rgba(0,224,255,0.03)',
        border: '1px solid rgba(0,224,255,0.12)',
      }}>
        <div style={{
          fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--caval-accent)',
          marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Prompt compus (preview)
        </div>

        {/* Vizualizare colorată prefix/subiect/suffix */}
        <div style={{ fontSize: 11.5, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace" }}>
          {prefix.trim() && (
            <span style={{ color: '#2FBF71' }}>{prefix.trim()} </span>
          )}
          <span style={{
            color: 'var(--caval-accent)',
            background: 'rgba(0,224,255,0.08)',
            padding: '1px 4px', borderRadius: 3,
          }}>
            {exampleSubject.trim() || '‹subiect›'}
          </span>
          {suffix.trim() && (
            <span style={{ color: '#D4A857' }}>{suffix.trim()}</span>
          )}
        </div>

        {/* Legendă culori */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {[
            { color: '#2FBF71', label: 'prefix' },
            { color: '#00E0FF', label: 'subiect' },
            { color: '#D4A857', label: 'suffix' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 9.5, color: 'var(--caval-text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Butoane */}
      <div style={{ display: 'flex', gap: 7 }}>
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          style={{
            flex: 1, padding: '7px', borderRadius: 6, border: 'none',
            background: name.trim() ? 'var(--caval-accent)' : 'rgba(255,255,255,0.07)',
            color: name.trim() ? '#0E0E0F' : 'var(--caval-text-muted)',
            fontWeight: 700, fontSize: 12.5, cursor: name.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {isNew ? 'Creează stil' : 'Salvează modificări'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 14px', borderRadius: 6,
            border: '1px solid var(--caval-border)',
            background: 'transparent', color: 'var(--caval-text-muted)',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          Anulează
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  PromptLibraryPanel — componenta principală
// ──────────────────────────────────────────────

// Template stil gol pentru "Stil nou"
const emptyStyle = (): PromptStyle => ({
  id: `style_new_${Date.now()}`,
  name: '',
  description: '',
  category: 'custom',
  prefix: '',
  suffix: '',
  exampleSubject: '',
  favorite: false,
  usageCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export function PromptLibraryPanel() {
  const {
    styles,
    selectedStyleId, editingStyleId,
    filterCategory, searchQuery,
    selectStyle, setEditingStyle,
    setFilterCategory, setSearchQuery,
    addStyle, updateStyle, deleteStyle, duplicateStyle, toggleFavorite,
    getFilteredStyles,
  } = usePromptLibraryStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newStyleDraft, setNewStyleDraft] = useState<PromptStyle>(emptyStyle);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredStyles = getFilteredStyles();

  // Categorii cu count
  const allCategories: (StyleCategory | 'all' | 'favorites')[] = [
    'all', 'favorites', 'ui-icons', 'app-assets', 'illustrations', 'marketing', 'photography', 'custom',
  ];

  const getCategoryCount = (cat: StyleCategory | 'all' | 'favorites') => {
    if (cat === 'all') return styles.length;
    if (cat === 'favorites') return styles.filter((s) => s.favorite).length;
    return styles.filter((s) => s.category === cat).length;
  };

  const editingStyle = editingStyleId
    ? styles.find((s) => s.id === editingStyleId) ?? null
    : null;

  const showEditor = isCreating || !!editingStyle;

  const handleSaveEdit = (patch: Partial<PromptStyle>) => {
    if (editingStyleId) {
      updateStyle(editingStyleId, patch);
      setEditingStyle(null);
    }
  };

  const handleSaveNew = (patch: Partial<PromptStyle>) => {
    const id = addStyle({
      ...newStyleDraft,
      ...patch,
    } as any);
    selectStyle(id);
    setIsCreating(false);
    setNewStyleDraft(emptyStyle());
  };

  const handleStartNew = () => {
    setEditingStyle(null);
    setNewStyleDraft(emptyStyle());
    setIsCreating(true);
  };

  const handleCancelEditor = () => {
    setIsCreating(false);
    setEditingStyle(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* ── Search + Add ─────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg
            width="12" height="12"
            viewBox="0 0 16 16" fill="none" stroke="var(--caval-text-muted)" strokeWidth="1.8"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="6.5" cy="6.5" r="4.5" /><path d="M11 11l3 3" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Caută stiluri…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--caval-bg)', border: '1px solid var(--caval-border)',
              borderRadius: 5, padding: '5px 8px 5px 26px',
              color: 'var(--caval-text)', fontSize: 12, outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'rgba(0,224,255,0.4)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--caval-border)'; }}
          />
        </div>
        <button
          onClick={handleStartNew}
          style={{
            padding: '5px 12px', borderRadius: 5, border: 'none',
            background: 'var(--caval-accent)', color: '#0E0E0F',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          Stil nou
        </button>
      </div>

      {/* ── Category filter ──────────────── */}
      <div style={{
        display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 12,
        paddingBottom: 3, flexWrap: 'nowrap',
      }}
        className="ai-messages-scroll"
      >
        {allCategories.map((cat) => {
          const count = getCategoryCount(cat);
          if (cat !== 'all' && cat !== 'favorites' && count === 0) return null;
          return (
            <CategoryPill
              key={cat}
              category={cat}
              selected={filterCategory === cat}
              count={count}
              onClick={() => setFilterCategory(cat)}
            />
          );
        })}
      </div>

      {/* ── Layout: lista + editor ────────── */}
      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0, overflow: 'hidden' }}>

        {/* Lista stiluri */}
        <div style={{
          width: showEditor ? '42%' : '100%',
          minWidth: showEditor ? 180 : undefined,
          overflowY: 'auto', flexShrink: 0,
          transition: 'width 0.2s',
        }}
          className="ai-messages-scroll"
        >
          {filteredStyles.length === 0 ? (
            <div style={{
              padding: '24px 12px', textAlign: 'center',
              color: 'var(--caval-text-muted)', fontSize: 12,
            }}>
              {searchQuery ? `Niciun stil pentru "${searchQuery}"` : 'Niciun stil în această categorie.'}
            </div>
          ) : (
            filteredStyles.map((style) => (
              <StyleCard
                key={style.id}
                style={style}
                isSelected={selectedStyleId === style.id}
                onSelect={() => { selectStyle(style.id); setIsCreating(false); }}
                onFavorite={() => toggleFavorite(style.id)}
                onDuplicate={() => duplicateStyle(style.id)}
                onDelete={() => deleteStyle(style.id)}
                onEdit={() => { setEditingStyle(style.id); setIsCreating(false); selectStyle(style.id); }}
              />
            ))
          )}
        </div>

        {/* Editor */}
        {showEditor && (
          <div style={{
            flex: 1, overflowY: 'auto', minWidth: 0,
            borderLeft: '1px solid var(--caval-border)',
            paddingLeft: 14,
          }}
            className="ai-messages-scroll"
          >
            {isCreating ? (
              <StyleEditor
                style={newStyleDraft}
                onSave={handleSaveNew}
                onCancel={handleCancelEditor}
                isNew
              />
            ) : editingStyle ? (
              <StyleEditor
                style={editingStyle}
                onSave={handleSaveEdit}
                onCancel={handleCancelEditor}
                isNew={false}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
