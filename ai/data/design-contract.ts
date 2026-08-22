/**
 * Pas 7h — non-negotiable design contract for UI / landing / web app generation.
 * Injected automatically via auto-web-context when category is `web`.
 */

export const DESIGN_CONTRACT_HEADER =
  "=== DESIGN CONTRACT (MANDATORY, NOT OPTIONAL) ===";

export const DESIGN_CONTRACT_CHECKLIST_HEADER =
  "=== DESIGN CHECKLIST (VERIFY BEFORE FINISHING) ===";

/** Strict implementation rules the model must follow when generating UI. */
export const DESIGN_CONTRACT_BODY = `
You are generating a product UI. Descriptive trends are NOT enough — obey this contract exactly.

FORBIDDEN
- Unstyled native controls as the primary UI: bare <input type="file">, bare <button>, bare <select>, bare <input> with no classes / wrapper.
- A page that is only a single form control with no hero, no layout, no visual hierarchy.
- Inline "browser default" look (gray buttons, system file picker as the only upload UX).
- Random colors without a defined palette; missing typography link; zero spacing system.
- Placeholder lorem-only pages with no real structure (nav / hero / CTA).

REQUIRED — styling system
- Simple / single-file HTML: include Tailwind via CDN in <head>:
  <script src="https://cdn.tailwindcss.com"></script>
- Projects with a build step: real Tailwind setup (postcss + tailwind.config) OR equivalent design-token CSS; do not ship unstyled markup.
- Load one Google Font explicitly in <head> (Inter, Poppins, or Manrope), e.g.:
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  Apply font-family on body (Tailwind font-sans after theme extend, or style="font-family: Inter, system-ui, sans-serif").

REQUIRED — palette
- Define a coherent palette as CSS variables OR Tailwind theme colors:
  --background, --foreground, --accent, --muted (and optional --card / --border).
- Use the palette for surfaces, text, CTAs, and muted secondary text. No one-off random hex spam.

REQUIRED — layout
- Centered container with max-width (e.g. max-w-6xl / max-w-7xl mx-auto).
- Consistent spacing from the 4/8/16/24/32 scale (Tailwind p-4, gap-4, py-16, etc.).
- Responsive: stack on small screens; horizontal where appropriate on md+.

REQUIRED — minimum page composition (landing / marketing / web app shell)
- Sticky or top nav OR a clear brand mark.
- Hero: large heading + short subtitle + at least one styled CTA button (rounded, accent background, hover state).
- At least one more section (features, upload widget, pricing, or social proof) — not hero alone with a naked input.

REQUIRED — upload / filters (when the product needs them)
- Upload: styled dropzone (dashed border, icon, title, helper text). Hide the native file input visually; trigger via label/button. NEVER leave a raw file input as the only UI.
- Filters: pill / chip buttons with clear active vs inactive styles (rounded-full, border, accent when selected).

IMPLEMENTATION RULE
- Prefer copying and adapting the CODE SNIPPETS provided in this context (HTML + Tailwind classes) over inventing unstyled markup.
- Every interactive control must have Tailwind utility classes (or equivalent token classes).
`.trim();

export const DESIGN_CONTRACT_CHECKLIST = `
Before you finish, confirm ALL of the following are true in the delivered code:
[ ] Tailwind CDN or real Tailwind build is present
[ ] Google Font (Inter / Poppins / Manrope) linked in <head> and applied
[ ] CSS variables or Tailwind theme define background / foreground / accent / muted
[ ] Centered max-width container + spacing from 4/8/16/24/32 scale
[ ] Hero with large heading + subtitle + styled CTA
[ ] No bare unstyled <input type="file"> / <button> / <select> as primary UI
[ ] If upload or filters are needed: modern dropzone + pill filters (see snippets)
[ ] Page is not a single naked input
`.trim();

/** Full contract block ready for projectContext injection. */
export function formatDesignContractBlock(): string {
  return [
    DESIGN_CONTRACT_HEADER,
    DESIGN_CONTRACT_BODY,
    "",
    DESIGN_CONTRACT_CHECKLIST_HEADER,
    DESIGN_CONTRACT_CHECKLIST,
  ].join("\n");
}
