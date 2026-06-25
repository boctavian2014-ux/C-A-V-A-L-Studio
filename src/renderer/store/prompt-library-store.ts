import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ──────────────────────────────────────────────
//  Prompt Library Store — Caval IDE
//  Stiluri predefinite pentru generare imagini.
//  Fiecare stil are: prefix + suffix + parametri
//  DALL-E opționali. Compune promptul final automat.
// ──────────────────────────────────────────────

export type StyleCategory =
  | 'ui-icons'
  | 'illustrations'
  | 'marketing'
  | 'app-assets'
  | 'photography'
  | 'custom';

export interface PromptStyle {
  id: string;
  name: string;                   // ex: "UI Icon Minimalist"
  description: string;            // scurtă descriere afișată în UI
  category: StyleCategory;
  prefix: string;                 // adăugat ÎNAINTE de subiect
  suffix: string;                 // adăugat DUPĂ subiect
  // Parametri DALL-E override (opțional — dacă nu sunt setați, se folosesc defaults din ImagePanel)
  overrideSize?: '1024x1024' | '1792x1024' | '1024x1792';
  overrideQuality?: 'standard' | 'hd';
  overrideStyle?: 'vivid' | 'natural';
  // Metadate
  favorite: boolean;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
  // Preview — promptul compus cu un subiect exemplu
  exampleSubject: string;         // ex: "settings gear icon"
}

// ── Stiluri built-in (nu pot fi șterse, doar editate) ──

export const BUILTIN_STYLES: PromptStyle[] = [
  {
    id: 'builtin_ui_icon_minimal',
    name: 'UI Icon Minimalist',
    description: 'Icon plat, vectorial, fundal alb. Perfect pentru butoane și meniuri.',
    category: 'ui-icons',
    prefix: 'Flat design vector icon, white background, minimal, clean lines, 2D, high quality,',
    suffix: '. No text, no shadows, centered composition, SVG style.',
    overrideSize: '1024x1024',
    overrideStyle: 'natural',
    favorite: true,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
    exampleSubject: 'settings gear',
  },
  {
    id: 'builtin_ui_icon_dark',
    name: 'UI Icon Dark Mode',
    description: 'Icon pe fundal dark/transparent. Ideal pentru Caval și alte IDE-uri dark.',
    category: 'ui-icons',
    prefix: 'Flat design icon, dark transparent background, glowing cyan accent, minimal, modern,',
    suffix: '. Transparent background PNG style, no text, centered, sharp edges.',
    overrideSize: '1024x1024',
    overrideStyle: 'natural',
    favorite: false,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
    exampleSubject: 'bolt lightning',
  },
  {
    id: 'builtin_app_icon',
    name: 'App Icon (Store Ready)',
    description: 'App icon gata pentru App Store / Google Play. Background solid + gradient.',
    category: 'app-assets',
    prefix: 'App store icon, rounded square shape, gradient background, bold design, professional, high quality,',
    suffix: '. Clean, modern app icon style. No text overlay.',
    overrideSize: '1024x1024',
    overrideQuality: 'hd',
    overrideStyle: 'vivid',
    favorite: true,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
    exampleSubject: 'music note',
  },
  {
    id: 'builtin_splash',
    name: 'Splash Screen',
    description: 'Ecran de încărcare cu fundal gradient și logo centrat.',
    category: 'app-assets',
    prefix: 'Mobile app splash screen, centered logo on gradient background, minimal text, professional,',
    suffix: '. Dark background, glowing accent color, atmospheric depth. No UI elements.',
    overrideSize: '1024x1792',
    overrideQuality: 'hd',
    overrideStyle: 'vivid',
    favorite: false,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
    exampleSubject: 'abstract waves',
  },
  {
    id: 'builtin_illustration_flat',
    name: 'Illustration Flat',
    description: 'Ilustrație plată cu culori vii. Bună pentru onboarding și landing pages.',
    category: 'illustrations',
    prefix: 'Flat vector illustration, vibrant colors, friendly characters, clean shapes, no gradients,',
    suffix: '. White background, editorial style, Dribbble quality.',
    overrideStyle: 'vivid',
    favorite: false,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
    exampleSubject: 'developer coding at desk',
  },
  {
    id: 'builtin_illustration_3d',
    name: 'Illustration 3D',
    description: 'Ilustrație 3D izometrică. Modernă, bună pentru SaaS dashboards.',
    category: 'illustrations',
    prefix: 'Isometric 3D illustration, soft shadows, pastel colors, clean render, professional,',
    suffix: '. White or light background, no text, centered composition, high quality 3D render.',
    overrideStyle: 'natural',
    overrideQuality: 'hd',
    favorite: false,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
    exampleSubject: 'server rack with connections',
  },
  {
    id: 'builtin_marketing_hero',
    name: 'Marketing Hero',
    description: 'Imagine hero pentru landing page sau header website.',
    category: 'marketing',
    prefix: 'Cinematic hero image, dramatic lighting, professional photography style, wide format,',
    suffix: '. High resolution, commercial use, no text overlay, space for copy on left side.',
    overrideSize: '1792x1024',
    overrideQuality: 'hd',
    overrideStyle: 'vivid',
    favorite: false,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
    exampleSubject: 'futuristic city at night',
  },
  {
    id: 'builtin_social_post',
    name: 'Social Media Post',
    description: 'Post pătrat pentru Instagram / Facebook. Eye-catching.',
    category: 'marketing',
    prefix: 'Social media post design, bold composition, vibrant colors, eye-catching, square format,',
    suffix: '. No text, social media ready, high contrast, visually striking.',
    overrideSize: '1024x1024',
    overrideStyle: 'vivid',
    favorite: false,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
    exampleSubject: 'abstract geometric pattern',
  },
  {
    id: 'builtin_photo_product',
    name: 'Product Photography',
    description: 'Fotografie produs pe fundal neutru. Studio quality.',
    category: 'photography',
    prefix: 'Product photography, studio lighting, neutral background, sharp focus, commercial quality,',
    suffix: '. Clean white or grey background, professional product shot, no people.',
    overrideQuality: 'hd',
    overrideStyle: 'natural',
    favorite: false,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
    exampleSubject: 'minimalist wireless headphones',
  },
];

// ── Tipul categoriei în română ────────────────

export const CATEGORY_LABELS: Record<StyleCategory, string> = {
  'ui-icons':      'UI Icons',
  'illustrations': 'Ilustrații',
  'marketing':     'Marketing',
  'app-assets':    'App Assets',
  'photography':   'Fotografie',
  'custom':        'Custom',
};

export const CATEGORY_COLORS: Record<StyleCategory, string> = {
  'ui-icons':      '#00E0FF',
  'illustrations': '#2FBF71',
  'marketing':     '#D4A857',
  'app-assets':    '#7C3AED',
  'photography':   '#F59E0B',
  'custom':        '#8A95A6',
};

// ── Store ─────────────────────────────────────

export interface PromptLibraryState {
  styles: PromptStyle[];

  // UI state (nu se persistă)
  selectedStyleId: string | null;
  editingStyleId: string | null;
  filterCategory: StyleCategory | 'all' | 'favorites';
  searchQuery: string;

  // Composer
  composedPrompt: string;        // promptul final compus (prefix + subiect + suffix)
  subjectInput: string;          // ce scrie userul ca "subiect"

  // Actions — CRUD
  addStyle:    (style: Omit<PromptStyle, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>) => string;
  updateStyle: (id: string, patch: Partial<Omit<PromptStyle, 'id' | 'createdAt'>>) => void;
  deleteStyle: (id: string) => void;
  duplicateStyle: (id: string) => void;
  toggleFavorite: (id: string) => void;
  incrementUsage: (id: string) => void;

  // Actions — UI
  selectStyle:        (id: string | null) => void;
  setEditingStyle:    (id: string | null) => void;
  setFilterCategory:  (cat: StyleCategory | 'all' | 'favorites') => void;
  setSearchQuery:     (q: string) => void;
  setSubjectInput:    (s: string) => void;

  // Selectors
  getFilteredStyles:  () => PromptStyle[];
  getSelectedStyle:   () => PromptStyle | null;
  composePrompt:      (styleId: string, subject: string, extraInstructions?: string) => string;
}

export const usePromptLibraryStore = create<PromptLibraryState>()(
  persist(
    (set, get) => ({
      styles: BUILTIN_STYLES,
      selectedStyleId: null,
      editingStyleId: null,
      filterCategory: 'all',
      searchQuery: '',
      composedPrompt: '',
      subjectInput: '',

      // ── CRUD ───────────────────────────────

      addStyle: (style) => {
        const id = `style_${Date.now()}`;
        const now = Date.now();
        set((s) => ({
          styles: [...s.styles, { ...style, id, usageCount: 0, createdAt: now, updatedAt: now }],
        }));
        return id;
      },

      updateStyle: (id, patch) => {
        set((s) => ({
          styles: s.styles.map((style) =>
            style.id === id
              ? { ...style, ...patch, updatedAt: Date.now() }
              : style
          ),
        }));
      },

      deleteStyle: (id) => {
        // Nu permite ștergerea stilurilor built-in
        if (id.startsWith('builtin_')) return;
        set((s) => ({
          styles: s.styles.filter((style) => style.id !== id),
          selectedStyleId: s.selectedStyleId === id ? null : s.selectedStyleId,
        }));
      },

      duplicateStyle: (id) => {
        const original = get().styles.find((s) => s.id === id);
        if (!original) return;
        const now = Date.now();
        const newId = `style_${now}`;
        set((s) => ({
          styles: [...s.styles, {
            ...original,
            id: newId,
            name: `${original.name} (copie)`,
            favorite: false,
            usageCount: 0,
            createdAt: now,
            updatedAt: now,
          }],
          editingStyleId: newId,
        }));
      },

      toggleFavorite: (id) => {
        set((s) => ({
          styles: s.styles.map((style) =>
            style.id === id
              ? { ...style, favorite: !style.favorite, updatedAt: Date.now() }
              : style
          ),
        }));
      },

      incrementUsage: (id) => {
        set((s) => ({
          styles: s.styles.map((style) =>
            style.id === id
              ? { ...style, usageCount: style.usageCount + 1, updatedAt: Date.now() }
              : style
          ),
        }));
      },

      // ── UI ─────────────────────────────────

      selectStyle: (id) => set({ selectedStyleId: id }),
      setEditingStyle: (id) => set({ editingStyleId: id }),
      setFilterCategory: (cat) => set({ filterCategory: cat }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setSubjectInput: (s) => set({ subjectInput: s }),

      // ── Selectors ──────────────────────────

      getFilteredStyles: () => {
        const { styles, filterCategory, searchQuery } = get();
        let filtered = styles;

        if (filterCategory === 'favorites') {
          filtered = filtered.filter((s) => s.favorite);
        } else if (filterCategory !== 'all') {
          filtered = filtered.filter((s) => s.category === filterCategory);
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q) ||
              s.prefix.toLowerCase().includes(q)
          );
        }

        // Sortare: favorite primele, apoi după usage
        return [...filtered].sort((a, b) => {
          if (a.favorite && !b.favorite) return -1;
          if (!a.favorite && b.favorite) return 1;
          return b.usageCount - a.usageCount;
        });
      },

      getSelectedStyle: () => {
        const { styles, selectedStyleId } = get();
        return styles.find((s) => s.id === selectedStyleId) ?? null;
      },

      // ── Composer ───────────────────────────
      // Compune promptul final: [prefix] [subiect] [suffix] [extraInstructions]

      composePrompt: (styleId, subject, extraInstructions) => {
        const style = get().styles.find((s) => s.id === styleId);
        if (!style) return subject;

        const parts: string[] = [];

        if (style.prefix.trim()) {
          parts.push(style.prefix.trim());
        }

        if (subject.trim()) {
          parts.push(subject.trim());
        }

        if (style.suffix.trim()) {
          // Suffix poate începe cu "." — îl lipim fără spațiu extra
          const suffix = style.suffix.trim();
          if (suffix.startsWith('.') || suffix.startsWith(',')) {
            // Înlocuiește ultimul spațiu din ultima parte cu suffix
            const last = parts[parts.length - 1] || '';
            parts[parts.length - 1] = last + suffix;
          } else {
            parts.push(suffix);
          }
        }

        if (extraInstructions?.trim()) {
          parts.push(extraInstructions.trim());
        }

        return parts.join(' ');
      },
    }),
    {
      name: 'caval-prompt-library',
      // Persista doar stilurile (nu starea UI)
      partialize: (state) => ({
        styles: state.styles,
      }),
    }
  )
);
