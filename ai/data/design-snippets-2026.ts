/**
 * Pas 7h — real HTML + Tailwind snippets for design enforcement.
 * No external deps beyond Tailwind CDN + Google Fonts.
 */

export type DesignSnippetId =
  | "hero-modern"
  | "navbar-glass"
  | "pricing-cards"
  | "feature-grid"
  | "upload-widget-modern"
  | "filter-pills";

export interface DesignSnippet {
  id: DesignSnippetId;
  title: string;
  /** Complete HTML fragment using Tailwind utility classes only. */
  html: string;
}

export const DESIGN_SNIPPETS_2026: Record<DesignSnippetId, DesignSnippet> = {
  "hero-modern": {
    id: "hero-modern",
    title: "Hero — gradient / glass + heading + CTA",
    html: `<section class="relative overflow-hidden bg-slate-950 text-white">
  <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-500/20 via-slate-950 to-slate-950"></div>
  <div class="relative mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-24 md:py-32">
    <p class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-cyan-200 backdrop-blur">New · 2026</p>
    <h1 class="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Build premium experiences that convert</h1>
    <p class="max-w-xl text-base text-slate-300 md:text-lg">A focused hero with clear hierarchy, glass accents, and one primary action.</p>
    <div class="flex flex-wrap items-center gap-4">
      <a href="#start" class="inline-flex items-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">Get started</a>
      <a href="#demo" class="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10">View demo</a>
    </div>
  </div>
</section>`,
  },

  "navbar-glass": {
    id: "navbar-glass",
    title: "Navbar — sticky glass",
    html: `<header class="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
  <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
    <a href="/" class="text-sm font-semibold tracking-wide text-white">Brand</a>
    <nav class="hidden items-center gap-8 text-sm text-slate-300 md:flex">
      <a href="#features" class="transition hover:text-white">Features</a>
      <a href="#pricing" class="transition hover:text-white">Pricing</a>
      <a href="#docs" class="transition hover:text-white">Docs</a>
    </nav>
    <a href="#cta" class="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">Sign up</a>
  </div>
</header>`,
  },

  "pricing-cards": {
    id: "pricing-cards",
    title: "Pricing — 3 cards, middle highlighted",
    html: `<section class="bg-slate-950 px-6 py-20 text-white">
  <div class="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
    <article class="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 class="text-lg font-semibold">Starter</h3>
      <p class="mt-2 text-3xl font-semibold">$19<span class="text-base font-normal text-slate-400">/mo</span></p>
      <ul class="mt-6 space-y-2 text-sm text-slate-300"><li>1 project</li><li>Email support</li></ul>
      <button type="button" class="mt-8 w-full rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">Choose</button>
    </article>
    <article class="relative rounded-2xl border border-cyan-400/40 bg-cyan-400/10 p-6 shadow-[0_0_40px_rgba(34,211,238,0.15)] md:-translate-y-2">
      <span class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-400 px-3 py-1 text-xs font-semibold text-slate-950">Popular</span>
      <h3 class="text-lg font-semibold">Pro</h3>
      <p class="mt-2 text-3xl font-semibold">$49<span class="text-base font-normal text-slate-300">/mo</span></p>
      <ul class="mt-6 space-y-2 text-sm text-slate-200"><li>Unlimited projects</li><li>Priority support</li></ul>
      <button type="button" class="mt-8 w-full rounded-full bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">Choose</button>
    </article>
    <article class="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 class="text-lg font-semibold">Enterprise</h3>
      <p class="mt-2 text-3xl font-semibold">Custom</p>
      <ul class="mt-6 space-y-2 text-sm text-slate-300"><li>SSO & SLA</li><li>Dedicated success</li></ul>
      <button type="button" class="mt-8 w-full rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">Contact</button>
    </article>
  </div>
</section>`,
  },

  "feature-grid": {
    id: "feature-grid",
    title: "Feature bento grid",
    html: `<section class="bg-slate-950 px-6 py-20 text-white">
  <div class="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
    <article class="rounded-2xl border border-white/10 bg-white/5 p-6 md:col-span-2">
      <div class="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-300">◆</div>
      <h3 class="text-xl font-semibold">Fast by default</h3>
      <p class="mt-2 text-sm text-slate-300">Ship performant UI with clear hierarchy and restrained motion.</p>
    </article>
    <article class="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div class="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/20 text-violet-300">◇</div>
      <h3 class="text-lg font-semibold">Accessible</h3>
      <p class="mt-2 text-sm text-slate-300">Keyboard focus and semantic structure.</p>
    </article>
    <article class="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div class="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300">○</div>
      <h3 class="text-lg font-semibold">Responsive</h3>
      <p class="mt-2 text-sm text-slate-300">Layouts that adapt without card soup.</p>
    </article>
    <article class="rounded-2xl border border-white/10 bg-white/5 p-6 md:col-span-2">
      <div class="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">▣</div>
      <h3 class="text-xl font-semibold">Design tokens</h3>
      <p class="mt-2 text-sm text-slate-300">Background, foreground, accent, muted — one coherent system.</p>
    </article>
  </div>
</section>`,
  },

  "upload-widget-modern": {
    id: "upload-widget-modern",
    title: "Upload dropzone — not a bare file input",
    html: `<div class="mx-auto w-full max-w-xl">
  <label for="file-upload" class="group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-cyan-400/40 bg-slate-900/60 px-8 py-12 text-center transition hover:border-cyan-300 hover:bg-slate-900">
    <span class="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400/15 text-2xl text-cyan-300">↑</span>
    <span class="text-base font-semibold text-white">Drop files here or click to browse</span>
    <span class="text-sm text-slate-400">PNG, JPG, WEBP up to 10MB</span>
    <span class="mt-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition group-hover:bg-cyan-300">Choose files</span>
    <input id="file-upload" type="file" class="sr-only" accept="image/*" multiple />
  </label>
</div>`,
  },

  "filter-pills": {
    id: "filter-pills",
    title: "Filter pills — active / inactive",
    html: `<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
  <button type="button" class="rounded-full bg-cyan-400 px-4 py-1.5 text-sm font-semibold text-slate-950">All</button>
  <button type="button" class="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">Streetwear</button>
  <button type="button" class="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">Formal</button>
  <button type="button" class="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">Casual</button>
  <button type="button" class="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">Sports</button>
</div>`,
  },
};

const UPLOAD_LIKE =
  /\b(upload|uploader|dropzone|drag\s*&\s*drop|file\s*input|fashion|imagine|image|photo|galerie|gallery|matching)\b/i;
const PRICING_LIKE = /\b(pricing|price\s*plan|premium|subscription|saas\s*pricing|tiers?)\b/i;
const DASHBOARD_LIKE = /\b(dashboard|analytics|admin\s*panel|feature\s*grid|bento)\b/i;

/**
 * Pick 1–3 snippets relevant to the user prompt (web / landing UI).
 */
export function selectDesignSnippets(userText: string, limit = 3): DesignSnippet[] {
  const ids: DesignSnippetId[] = [];
  const push = (id: DesignSnippetId) => {
    if (!ids.includes(id)) ids.push(id);
  };

  if (UPLOAD_LIKE.test(userText)) {
    push("upload-widget-modern");
    push("filter-pills");
    push("hero-modern");
  } else if (PRICING_LIKE.test(userText)) {
    push("hero-modern");
    push("pricing-cards");
    push("navbar-glass");
  } else if (DASHBOARD_LIKE.test(userText)) {
    push("navbar-glass");
    push("feature-grid");
    push("hero-modern");
  } else {
    push("hero-modern");
    push("navbar-glass");
    push("feature-grid");
  }

  return ids.slice(0, limit).map((id) => DESIGN_SNIPPETS_2026[id]);
}

export function formatDesignSnippetsBlock(snippets: DesignSnippet[]): string {
  if (!snippets.length) return "";
  const parts = [
    "=== DESIGN CODE SNIPPETS (COPY & ADAPT — REAL HTML + TAILWIND) ===",
    "Adapt these fragments directly. Do not replace them with unstyled native controls.",
  ];
  for (const snip of snippets) {
    parts.push(`--- snippet: ${snip.id} (${snip.title}) ---`);
    parts.push(snip.html.trim());
  }
  return parts.join("\n\n");
}
