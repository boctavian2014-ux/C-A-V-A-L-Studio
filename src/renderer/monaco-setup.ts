import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
// Bare `monaco-editor` aliases to editor.api.js; load TS language API separately.
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution.js';

type MonacoTs = {
  typescriptDefaults?: {
    setDiagnosticsOptions: (options: Record<string, unknown>) => void;
    setCompilerOptions: (options: Record<string, unknown>) => void;
  };
  javascriptDefaults?: {
    setDiagnosticsOptions: (options: Record<string, unknown>) => void;
  };
  ScriptTarget?: { ESNext: number };
  ModuleKind?: { ESNext: number };
};

const tsLang = monaco.languages.typescript as unknown as MonacoTs | undefined;

// Disable Monaco's in-renderer TS semantic checker before any Editor mounts.
// Type-checking belongs in main/LSP — keeping it here blows renderer RAM.
if (tsLang?.typescriptDefaults && tsLang.ScriptTarget && tsLang.ModuleKind) {
  tsLang.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });
  tsLang.typescriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    target: tsLang.ScriptTarget.ESNext,
    module: tsLang.ModuleKind.ESNext,
  });
  tsLang.javascriptDefaults?.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });
}

// Must run before any Editor component import chain initializes @monaco-editor/loader.
loader.config({ monaco });
