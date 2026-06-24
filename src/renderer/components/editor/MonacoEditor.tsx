import React, { useCallback, useEffect, useRef } from 'react';
import Editor, { useMonaco, type OnMount, type OnChange } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { useEditorStore } from '../../store/editor-store';
import { useCavalTheme } from '../../../../themes/theme-provider';

// ──────────────────────────────────────────────
//  Tema Monaco customizată după Caval dark theme
// ──────────────────────────────────────────────

const CAVAL_DARK_THEME: MonacoType.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment',           foreground: '5C6370', fontStyle: 'italic' },
    { token: 'keyword',           foreground: 'C678DD' },
    { token: 'string',            foreground: '98C379' },
    { token: 'number',            foreground: 'D19A66' },
    { token: 'type',              foreground: 'E5C07B' },
    { token: 'function',          foreground: '61AFEF' },
    { token: 'variable',          foreground: 'E06C75' },
    { token: 'operator',          foreground: '56B6C2' },
    { token: 'delimiter',         foreground: 'ABB2BF' },
    { token: 'tag',               foreground: 'E06C75' },
    { token: 'attribute.name',    foreground: 'D19A66' },
    { token: 'attribute.value',   foreground: '98C379' },
  ],
  colors: {
    'editor.background':                '#0D1117',
    'editor.foreground':                '#F5F7FA',
    'editor.lineHighlightBackground':   '#00E0FF08',
    'editor.selectionBackground':       '#00E0FF22',
    'editor.inactiveSelectionBackground': '#00E0FF11',
    'editorLineNumber.foreground':      '#3B4658',
    'editorLineNumber.activeForeground':'#8A95A6',
    'editorCursor.foreground':          '#00E0FF',
    'editorWhitespace.foreground':      '#3B465820',
    'editorIndentGuide.background':     '#3B465830',
    'editorIndentGuide.activeBackground':'#00E0FF40',
    'editor.findMatchBackground':       '#D4A85730',
    'editor.findMatchHighlightBackground': '#D4A85718',
    'editorBracketMatch.background':    '#00E0FF15',
    'editorBracketMatch.border':        '#00E0FF50',
    'scrollbar.shadow':                 '#00000000',
    'scrollbarSlider.background':       '#8A95A615',
    'scrollbarSlider.hoverBackground':  '#8A95A625',
    'scrollbarSlider.activeBackground': '#8A95A635',
    'editorGutter.background':          '#0D1117',
    'minimap.background':               '#0D1117',
  },
};

// ──────────────────────────────────────────────
//  Opțiuni editor
// ──────────────────────────────────────────────

const EDITOR_OPTIONS: MonacoType.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
  fontLigatures: true,
  lineHeight: 22,
  letterSpacing: 0,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  smoothScrolling: true,
  minimap: { enabled: true, scale: 1, renderCharacters: false },
  lineNumbers: 'on',
  renderLineHighlight: 'line',
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: true,
  formatOnPaste: true,
  formatOnType: false,
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  quickSuggestions: { other: true, comments: false, strings: false },
  parameterHints: { enabled: true },
  inlayHints: { enabled: 'on' },
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
    highlightActiveBracketPair: true,
  },
  padding: { top: 12, bottom: 12 },
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
    useShadows: false,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  contextmenu: true,
  mouseWheelZoom: false,
  multiCursorModifier: 'ctrlCmd',
  // Salvează cu Ctrl+S
  // keybindings gestionate mai jos
};

// ──────────────────────────────────────────────
//  Component
// ──────────────────────────────────────────────

export function MonacoEditor() {
  const monaco = useMonaco();
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const { theme } = useCavalTheme();

  const {
    tabs,
    activeTabId,
    updateTabContent,
    saveTab,
    saveViewState,
  } = useEditorStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // ── Înregistrează tema când Monaco e gata ──
  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme('caval-dark', CAVAL_DARK_THEME);
    monaco.editor.setTheme('caval-dark');

    const ts = monaco.languages.typescript as unknown as {
      typescriptDefaults?: { setCompilerOptions: (options: Record<string, unknown>) => void; setDiagnosticsOptions: (options: Record<string, unknown>) => void };
      ScriptTarget: { ESNext: number };
      ModuleKind: { ESNext: number };
      ModuleResolutionKind: { NodeJs: number };
      JsxEmit: { ReactJSX: number };
    };
    if (ts?.typescriptDefaults) {
      ts.typescriptDefaults.setCompilerOptions({
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        jsx: ts.JsxEmit.ReactJSX,
        strict: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true
      });
      ts.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false
      });
    }
  }, [monaco]);

  // ── Salvează viewState când schimbi tab-ul ──
  useEffect(() => {
    return () => {
      if (editorRef.current && activeTabId) {
        const vs = editorRef.current.saveViewState();
        saveViewState(activeTabId, vs);
      }
    };
  }, [activeTabId]);

  // ── Restaurează viewState când tab-ul devine activ ──
  useEffect(() => {
    if (!editorRef.current || !activeTab?.viewState) return;
    editorRef.current.restoreViewState(
      activeTab.viewState as MonacoType.editor.ICodeEditorViewState
    );
    editorRef.current.focus();
  }, [activeTabId]);

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;

    const monacoApi = monaco as typeof MonacoType;
    editor.addCommand(
      monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS,
      () => {
        const { activeTabId: tabId } = useEditorStore.getState();
        if (tabId) saveTab(tabId);
      }
    );

    editor.focus();

    const lang = useEditorStore.getState().tabs.find((t) => t.id === useEditorStore.getState().activeTabId)?.language ?? 'typescript';
    const provider = monacoApi.languages.registerInlineCompletionsProvider(lang, {
      provideInlineCompletions: async (model, position) => {
        const textUntil = model.getValueInRange({
          startLineNumber: Math.max(1, position.lineNumber - 20),
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const caval = (window as unknown as {
          caval?: { autocomplete?: (i: { prefix: string; filePath: string; language: string }) => Promise<{ suggestion?: string }> };
        }).caval;
        const tab = useEditorStore.getState().tabs.find((t) => t.id === useEditorStore.getState().activeTabId);
        const result = await caval?.autocomplete?.({
          prefix: textUntil,
          filePath: tab?.path ?? 'untitled.ts',
          language: tab?.language ?? 'typescript',
        });
        const suggestion = result?.suggestion?.trim();
        if (!suggestion) return { items: [] };
        return {
          items: [{
            insertText: suggestion,
            range: new monacoApi.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          }],
        };
      },
      disposeInlineCompletions: () => undefined,
    });

    editor.onDidDispose(() => provider.dispose());
  }, [monaco, saveTab]);

  const handleChange: OnChange = useCallback((value) => {
    if (activeTabId && value !== undefined) {
      updateTabContent(activeTabId, value);
    }
  }, [activeTabId, updateTabContent]);

  // ── Ecran gol când nu e niciun tab deschis ──
  if (!activeTab) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0D1117', flexDirection: 'column', gap: 12,
        color: theme.colors.textMuted, userSelect: 'none',
      }}>
        <svg width="48" height="48" viewBox="0 0 26 26" fill="none">
          <polygon points="13,2 24,8 24,18 13,24 2,18 2,8"
            stroke="#00E0FF" strokeWidth="1.2" fill="rgba(0,224,255,0.06)" />
          <path d="M8 13 L11 16 L18 10"
            stroke="#00E0FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
          <div style={{ color: '#F5F7FA', fontWeight: 600, marginBottom: 4 }}>Caval IDE</div>
          Deschide un fișier din sidebar
          <br />
          sau apasă <kbd style={{
            background: 'rgba(0,224,255,0.1)', border: '1px solid rgba(0,224,255,0.3)',
            borderRadius: 4, padding: '1px 6px', fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, color: '#00E0FF',
          }}>Ctrl+P</kbd> pentru căutare rapidă
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Breadcrumb */}
      <div style={{
        padding: '4px 16px', borderBottom: `1px solid ${theme.colors.border}`,
        background: '#0D1117', fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {activeTab.path
          .replace(/\\/g, '/')
          .split('/')
          .map((part, i, arr) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
              <span style={{ color: i === arr.length - 1 ? theme.colors.text : theme.colors.textMuted }}>
                {part}
              </span>
            </React.Fragment>
          ))}
        {activeTab.isDirty && (
          <span style={{
            marginLeft: 6, width: 6, height: 6, borderRadius: '50%',
            background: '#F59E0B', display: 'inline-block',
          }} title="Modificări nesalvate" />
        )}
      </div>

      {/* Editor */}
      <Editor
        height="100%"
        language={activeTab.language}
        value={activeTab.content}
        theme="caval-dark"
        options={EDITOR_OPTIONS}
        onMount={handleMount}
        onChange={handleChange}
        loading={
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0D1117', color: '#3B4658', fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
          }}>
            Se încarcă editorul...
          </div>
        }
      />
    </div>
  );
}
