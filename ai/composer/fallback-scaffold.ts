import type { TimelineEvent } from "../../src/shared/ai-timeline-contract";
import { sanitizeTimelineEvent } from "../../src/shared/ai-timeline-contract";
import { applyScaffoldToWorkspace } from "./scaffold-apply";
import type { ParsedScaffoldFile } from "./scaffold-parser";
import { joinWorkspaceRelativePath } from "./written-files";

export const FALLBACK_SCAFFOLD_TOAST =
  "Proiect creat cu scaffold minim — AI nu a generat fișiere. Editează src/App.tsx pentru a începe.";

export const FALLBACK_SCAFFOLD_TIMELINE_LABEL =
  "Fallback scaffold applied (no fences detected).";

export const FALLBACK_RUNNABLE_TOAST =
  "Am completat package.json ca Preview să poată rula (npm run dev).";

/** Required files before an explicit Vite scaffold may report success. */
export const MINIMAL_VITE_MANIFEST_PATHS = [
  "package.json",
  "index.html",
  "src/main.tsx",
  "src/App.tsx",
] as const;

export const INCOMPLETE_VITE_SCAFFOLD_ERROR =
  "Scaffold incomplet: lipsesc fișiere din manifestul minim Vite. Nu raportez succes până nu există package.json, index.html, vite.config.*, src/main.tsx și src/App.tsx.";

function normalizeRelPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function hasViteConfigFile(files: Iterable<string>): boolean {
  return [...files].some((file) => /(^|\/)vite\.config\.(t|j|mj|cj)s$/i.test(normalizeRelPath(file)));
}

export function missingMinimalViteManifest(files: Iterable<string>): string[] {
  const present = new Set([...files].map(normalizeRelPath));
  const missing: string[] = MINIMAL_VITE_MANIFEST_PATHS.filter((path) => !present.has(path));
  if (!hasViteConfigFile(present)) missing.push("vite.config.ts");
  return missing;
}

async function readWorkspaceText(
  projectPath: string,
  relativePath: string
): Promise<string | null> {
  const caval = window.caval;
  if (!caval?.fs?.readFile) return null;
  const rel = relativePath.replace(/\\/g, "/");
  const abs = projectPath ? joinWorkspaceRelativePath(projectPath, rel) : rel;
  for (const candidate of [rel, abs]) {
    try {
      const res = await caval.fs.readFile(candidate);
      if (res?.ok && typeof res.content === "string") return res.content;
    } catch {
      /* missing */
    }
  }
  return null;
}

function slugName(projectName: string): string {
  return projectName.replace(/[^a-zA-Z0-9\-_]/g, "-").toLowerCase() || "caval-project";
}

/** True when package.json exists and defines scripts.dev. */
export async function workspaceHasRunnableWebProject(projectPath: string): Promise<boolean> {
  const raw = await readWorkspaceText(projectPath, "package.json");
  if (!raw) return false;
  try {
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return Boolean(pkg.scripts?.dev?.trim());
  } catch {
    return false;
  }
}

/** @deprecated Prefer workspaceHasRunnableWebProject */
export async function workspaceHasCodeFiles(projectPath: string): Promise<boolean> {
  return workspaceHasRunnableWebProject(projectPath);
}

export async function looksLikeExpressApi(projectPath: string): Promise<boolean> {
  const candidates = ["src/index.ts", "src/main.ts", "index.ts", "server.ts", "src/server.ts"];
  for (const rel of candidates) {
    const text = await readWorkspaceText(projectPath, rel);
    if (text && /from ['"]express['"]|require\(['"]express['"]\)/.test(text)) {
      return true;
    }
  }
  const routes = await readWorkspaceText(projectPath, "src/routes/documentRoutes.ts");
  return Boolean(routes);
}

export async function looksLikeViteFrontend(projectPath: string): Promise<boolean> {
  const markers = ["vite.config.ts", "vite.config.js", "index.html", "src/main.tsx", "src/App.tsx"];
  for (const rel of markers) {
    if (await readWorkspaceText(projectPath, rel)) return true;
  }
  return false;
}

export function getMinimalViteReactScaffoldFiles(projectName = "caval-project"): ParsedScaffoldFile[] {
  const name = slugName(projectName);
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
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
            colors: {
              background: '#020617',
              foreground: '#f8fafc',
              accent: '#22d3ee',
              muted: '#94a3b8',
            },
          },
        },
      };
    </script>
  </head>
  <body class="min-h-screen bg-background font-sans text-foreground antialiased">
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
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold tracking-wide text-accent">Caval</span>
        <a
          href="#start"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110"
        >
          Get started
        </a>
      </header>
      <main className="flex flex-1 flex-col justify-center gap-6">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
          Caval Project
        </h1>
        <p className="max-w-xl text-base text-muted md:text-lg">
          Scaffold minim cu Tailwind CDN + Inter. Editează src/App.tsx pentru a începe.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            id="start"
            href="#"
            className="inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
          >
            Primary CTA
          </a>
          <a
            href="#"
            className="inline-flex rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-foreground transition hover:bg-white/10"
          >
            Secondary
          </a>
        </div>
      </main>
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

export function getMinimalExpressScaffoldFiles(projectName = "caval-project"): ParsedScaffoldFile[] {
  const name = slugName(projectName);
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
            dev: "tsx watch src/index.ts",
            start: "tsx src/index.ts",
          },
          dependencies: {
            express: "^4.19.2",
            "body-parser": "^1.20.2",
          },
          devDependencies: {
            "@types/express": "^4.17.21",
            "@types/body-parser": "^1.19.5",
            "@types/node": "^20.14.0",
            tsx: "^4.16.2",
            typescript: "^5.5.3",
          },
        },
        null,
        2
      )}\n`,
    },
    {
      path: "src/index.ts",
      content: `import express from "express";

const app = express();
const port = 3000;

app.use(express.json());

app.get("/", (_req, res) => {
  res.type("html").send(\`<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>API Ready</title></head>
  <body style="font-family:system-ui;padding:2rem">
    <h1>API running</h1>
    <p>Express pe <code>http://localhost:\${port}</code></p>
  </body>
</html>\`);
});

app.listen(port, () => {
  console.log(\`Server is running on http://localhost:\${port}\`);
});
`,
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            outDir: "dist",
            rootDir: "src",
          },
          include: ["src"],
        },
        null,
        2
      )}\n`,
    },
    {
      path: "caval.jsonc",
      content: `{
  "preview": {
    "web": {
      "enabled": true,
      "cwd": ".",
      "command": "npm run dev",
      "url": "http://localhost:3000",
      "openMode": "external"
    }
  }
}
`,
    },
  ];
}

export function buildFallbackScaffoldTimelineEvent(): TimelineEvent {
  return sanitizeTimelineEvent({
    type: "file_write",
    label: FALLBACK_SCAFFOLD_TIMELINE_LABEL,
    detail: "Minimal runnable scaffold (package.json + preview)",
    filePath: "package.json",
    success: true,
  });
}

async function pickTemplates(
  projectPath: string,
  projectName?: string
): Promise<ParsedScaffoldFile[]> {
  if (await looksLikeExpressApi(projectPath)) {
    return getMinimalExpressScaffoldFiles(projectName);
  }
  if (await looksLikeViteFrontend(projectPath)) {
    return getMinimalViteReactScaffoldFiles(projectName);
  }
  // Empty / unknown → Vite SPA (web Preview default).
  return getMinimalViteReactScaffoldFiles(projectName);
}

/**
 * Fill missing runnable files. Never overwrites App.tsx / source the AI already wrote,
 * except rewriting a broken package.json that lacks scripts.dev.
 */
export async function applyFallbackScaffold(
  projectPath: string,
  options?: { projectName?: string }
): Promise<{ written: string[]; errors: string[]; skippedBecauseExisting: boolean }> {
  if (await workspaceHasRunnableWebProject(projectPath)) {
    return { written: [], errors: [], skippedBecauseExisting: true };
  }

  const templates = await pickTemplates(projectPath, options?.projectName);
  const toWrite: ParsedScaffoldFile[] = [];

  for (const file of templates) {
    const existing = await readWorkspaceText(projectPath, file.path);
    if (!existing) {
      toWrite.push(file);
      continue;
    }
    if (file.path === "package.json") {
      try {
        const pkg = JSON.parse(existing) as { scripts?: Record<string, string> };
        if (!pkg.scripts?.dev?.trim()) {
          toWrite.push(file);
        }
      } catch {
        toWrite.push(file);
      }
    }
  }

  if (toWrite.length === 0) {
    return { written: [], errors: [], skippedBecauseExisting: true };
  }

  const applied = await applyScaffoldToWorkspace(projectPath, toWrite);
  return {
    written: applied.written,
    errors: applied.errors,
    skippedBecauseExisting: false,
  };
}

/**
 * Explicit „Creează scaffold Vite minim”: always the internal Vite generator,
 * never Express inference. Completes missing manifest files; does not treat a
 * partial tree as success.
 */
export async function applyExplicitMinimalViteScaffold(
  projectPath: string,
  options?: { projectName?: string }
): Promise<{ written: string[]; errors: string[]; missing: string[]; complete: boolean }> {
  const templates = getMinimalViteReactScaffoldFiles(options?.projectName);
  const present: string[] = [];
  const toWrite: ParsedScaffoldFile[] = [];

  for (const file of templates) {
    const existing = await readWorkspaceText(projectPath, file.path);
    if (existing) {
      present.push(file.path);
      if (file.path === "package.json") {
        try {
          const pkg = JSON.parse(existing) as { scripts?: Record<string, string> };
          if (!pkg.scripts?.dev?.trim()) toWrite.push(file);
        } catch {
          toWrite.push(file);
        }
      }
      continue;
    }
    toWrite.push(file);
  }

  let written: string[] = [];
  let errors: string[] = [];
  if (toWrite.length > 0) {
    const applied = await applyScaffoldToWorkspace(projectPath, toWrite);
    written = applied.written;
    errors = applied.errors;
  }

  const missing = missingMinimalViteManifest([...present, ...written]);
  return {
    written,
    errors,
    missing,
    complete: missing.length === 0 && errors.length === 0,
  };
}
