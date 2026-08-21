import type { TimelineEvent } from "../../src/shared/ai-timeline-contract";
import { sanitizeTimelineEvent } from "../../src/shared/ai-timeline-contract";
import { applyScaffoldToWorkspace } from "./scaffold-apply";
import type { ParsedScaffoldFile } from "./scaffold-parser";
import { joinWorkspaceRelativePath } from "./written-files";

export const FALLBACK_SCAFFOLD_TOAST =
  "Proiect creat cu scaffold minim — AI nu a generat fișiere. Editează src/App.tsx pentru a începe.";

export const FALLBACK_SCAFFOLD_TIMELINE_LABEL =
  "Fallback scaffold applied (no fences detected).";

const CODE_MARKERS = [
  "package.json",
  "index.html",
  "src/main.tsx",
  "src/App.tsx",
  "vite.config.ts",
  "tsconfig.json",
] as const;

/** True when the workspace already has user/code files (ignores .caval / .cavalo). */
export async function workspaceHasCodeFiles(projectPath: string): Promise<boolean> {
  const caval = window.caval;
  if (!caval?.fs?.readFile) return false;
  for (const rel of CODE_MARKERS) {
    const abs = joinWorkspaceRelativePath(projectPath, rel);
    try {
      const res = await caval.fs.readFile(abs);
      if (res?.ok) return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

export function getMinimalViteReactScaffoldFiles(projectName = "caval-project"): ParsedScaffoldFile[] {
  const name = projectName.replace(/[^a-zA-Z0-9\-_]/g, "-").toLowerCase() || "caval-project";
  return [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name,
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc && vite build",
            preview: "vite preview",
          },
          dependencies: {
            react: "^18.3.1",
            "react-dom": "^18.3.1",
          },
          devDependencies: {
            "@types/react": "^18.3.3",
            "@types/react-dom": "^18.3.0",
            "@vitejs/plugin-react": "^4.3.1",
            typescript: "^5.5.3",
            vite: "^5.3.4",
          },
        },
        null,
        2
      )}\n`,
    },
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Caval Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: "src/main.tsx",
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
    },
    {
      path: "src/App.tsx",
      content: `export default function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Caval Project</h1>
      <p>Scaffold minim generat automat. Editează src/App.tsx pentru a începe.</p>
    </div>
  );
}
`,
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
            strict: true,
            skipLibCheck: true,
          },
          include: ["src"],
        },
        null,
        2
      )}\n`,
    },
  ];
}

export function buildFallbackScaffoldTimelineEvent(): TimelineEvent {
  return sanitizeTimelineEvent({
    type: "file_write",
    label: FALLBACK_SCAFFOLD_TIMELINE_LABEL,
    detail: "Minimal Vite + React + TypeScript scaffold",
    filePath: "src/App.tsx",
    success: true,
  });
}

/**
 * Write a minimal Vite+React+TS project when the AI stream produced no valid fences.
 * No-op (written=[]) when code files already exist on disk.
 */
export async function applyFallbackScaffold(
  projectPath: string,
  options?: { projectName?: string }
): Promise<{ written: string[]; errors: string[]; skippedBecauseExisting: boolean }> {
  if (await workspaceHasCodeFiles(projectPath)) {
    return { written: [], errors: [], skippedBecauseExisting: true };
  }

  const files = getMinimalViteReactScaffoldFiles(options?.projectName);
  const applied = await applyScaffoldToWorkspace(projectPath, files);
  return {
    written: applied.written,
    errors: applied.errors,
    skippedBecauseExisting: false,
  };
}
