import React, { useCallback, useEffect, useRef } from 'react';
import Editor, { useMonaco, type OnMount, type OnChange } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { useEditorStore } from '../../store/editor-store';
import { useSettingsStore } from '../../store/settings-store';
import { useAIStore } from '../../../../ai/composer/ai-store';
import { useCavalTheme } from '../../../../themes/theme-provider';
import { EngineeringCadPreview } from '../engineering/EngineeringCadPreview';
import { useEngineeringCadStore } from '../../store/engineering-cad-store';
import { registerMonacoEditor } from '../../store/editor-command-store';
import { CavaloHorseMark } from '../brand/CavaloHorseMark';

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

  const { fontSize, tabSize, wordWrap, minimap } = useSettingsStore((s) => s.app);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const isAiLive = Boolean(activeTab?.isAiPreview);

  // Scroll la final când AI scrie live în preview
  useEffect(() => {
    if (!isAiLive || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    const lastLine = model.getLineCount();
    editorRef.current.revealLine(lastLine);
  }, [activeTab?.content, isAiLive]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({
      fontSize,
      tabSize,
      wordWrap: wordWrap ? 'on' : 'off',
      minimap: { enabled: minimap },
    });
  }, [fontSize, tabSize, wordWrap, minimap]);

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

  useEffect(() => {
    if (!monaco || !activeTab) return;
    const lang = activeTab.language;
    const lspLanguages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'python'];
    if (!lspLanguages.includes(lang)) return;
    void (window.caval as { lsp?: { start?: (id: string) => Promise<unknown> } })?.lsp?.start?.(lang);
  }, [monaco, activeTab?.language]);

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
    registerMonacoEditor(editor);

    const monacoApi = monaco as typeof MonacoType;
    editor.addCommand(
      monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS,
      () => {
        const { activeTabId: tabId } = useEditorStore.getState();
        if (tabId) saveTab(tabId);
      }
    );

    editor.focus();

    const syncSelection = () => {
      const model = editor.getModel();
      const sel = editor.getSelection();
      const { activeTabId: tabId, tabs, setEditorSelection, setActiveSymbol } = useEditorStore.getState();
      const tab = tabs.find((t) => t.id === tabId);
      if (!model || !sel || sel.isEmpty() || !tab) {
        setEditorSelection(null);
        return;
      }
      const text = model.getValueInRange(sel).trim();
      if (!text) {
        setEditorSelection(null);
        return;
      }
      setEditorSelection({
        text,
        path: tab.path,
        startLine: sel.startLineNumber,
        endLine: sel.endLineNumber,
      });
      const word = model.getWordAtPosition({
        lineNumber: sel.positionLineNumber,
        column: sel.positionColumn,
      });
      setActiveSymbol(word?.word ?? null);
      if (text.length > 0 && text.length < 8000) {
        useAIStore.getState().setIncludeMode('selection');
      }
    };

    editor.onDidChangeCursorSelection(syncSelection);
    editor.onDidChangeCursorPosition(() => {
      const model = editor.getModel();
      const pos = editor.getPosition();
      if (!model || !pos) return;
      const word = model.getWordAtPosition(pos);
      useEditorStore.getState().setActiveSymbol(word?.word ?? null);
    });

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

    editor.onDidDispose(() => {
      provider.dispose();
      registerMonacoEditor(null);
    });
  }, [monaco, saveTab]);

  useEffect(() => {
    const onRevealLine = (e: Event) => {
      const detail = (e as CustomEvent<{ path: string; line: number; col?: number }>).detail;
      if (!detail?.path || !editorRef.current) return;
      const { tabs, activeTabId, openFile, setActiveTab } = useEditorStore.getState();
      const normalized = detail.path.replace(/\\/g, '/');
      const tab = tabs.find((t) => t.path.replace(/\\/g, '/') === normalized);
      if (tab) {
        if (activeTabId !== tab.id) setActiveTab(tab.id);
      } else {
        void openFile(detail.path).then(() => {
          window.setTimeout(() => {
            const ed = editorRef.current;
            if (!ed) return;
            ed.revealLineInCenter(detail.line);
            ed.setPosition({ lineNumber: detail.line, column: detail.col ?? 1 });
            ed.focus();
          }, 50);
        });
        return;
      }
      editorRef.current.revealLineInCenter(detail.line);
      editorRef.current.setPosition({ lineNumber: detail.line, column: detail.col ?? 1 });
      editorRef.current.focus();
    };
    document.addEventListener('caval:reveal-line', onRevealLine);
    return () => document.removeEventListener('caval:reveal-line', onRevealLine);
  }, [activeTabId]);

  const handleChange: OnChange = useCallback((value) => {
    if (activeTabId && value !== undefined) {
      updateTabContent(activeTabId, value);
    }
  }, [activeTabId, updateTabContent]);

  const cadStlUrl = useEngineeringCadStore((s) => s.stlUrl);

  // ── Ecran gol când nu e niciun tab deschis ──
  if (!activeTab) {
    if (cadStlUrl) {
      return <EngineeringCadPreview />;
    }
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0D1117', flexDirection: 'column', gap: 16,
        color: theme.colors.textMuted, userSelect: 'none',
      }}>
        <CavaloHorseMark size={88} />
        <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
          <div style={{
            color: '#F5F7FA', fontWeight: 800, marginBottom: 6,
            fontFamily: "'Sora', sans-serif", letterSpacing: '0.12em', fontSize: 14,
          }}>CAVALLO</div>
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
      {isAiLive && (
        <div style={{
          padding: '6px 16px',
          borderBottom: `1px solid rgba(0,224,255,0.25)`,
          background: 'linear-gradient(90deg, rgba(0,224,255,0.12), rgba(124,58,237,0.08))',
          fontSize: 11.5,
          color: '#00E0FF',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: "'Inter', sans-serif",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isStreaming ? '#00E0FF' : '#2FBF71',
            boxShadow: isStreaming ? '0 0 8px #00E0FF' : 'none',
            animation: isStreaming ? 'pulseTech 1.2s ease-in-out infinite' : 'none',
          }} />
          {isStreaming ? 'AI scrie cod live' : 'Previzualizare generare AI'}
          <span style={{ color: 'var(--caval-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5 }}>
            {activeTab.path.replace(/^preview:\/\//, '')}
          </span>
        </div>
      )}
      {/* Breadcrumb */}
      <div style={{
        padding: '4px 16px', borderBottom: `1px solid ${theme.colors.border}`,
        background: '#0D1117', fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {(isAiLive ? activeTab.path.replace(/^preview:\/\//, '').split('/') : activeTab.path
          .replace(/\\/g, '/')
          .split('/'))
          .map((part, i, arr) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
              <span style={{ color: i === arr.length - 1 ? theme.colors.text : theme.colors.textMuted }}>
                {part}
              </span>
            </React.Fragment>
          ))}
        {activeTab.isDirty && !isAiLive && (
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
        options={{
          ...EDITOR_OPTIONS,
          fontSize,
          tabSize,
          wordWrap: wordWrap ? 'on' : 'off',
          minimap: { enabled: minimap },
          readOnly: isAiLive && isStreaming,
        }}
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
