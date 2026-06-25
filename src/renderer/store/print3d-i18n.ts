export type Print3DLanguage = 'ro' | 'en';

const strings = {
  statusQueued: { ro: 'În coadă…', en: 'Queued…' },
  statusGenerating: { ro: 'Generez modelul…', en: 'Generating model…' },
  statusGeneratingScad: { ro: 'Generez OpenSCAD…', en: 'Generating OpenSCAD…' },
  statusGeneratingMesh: { ro: 'Generez mesh 3D…', en: 'Generating 3D mesh…' },
  statusRendering: { ro: 'Compilez STL…', en: 'Compiling STL…' },
  statusDone: { ro: 'Gata', en: 'Done' },
  statusFailed: { ro: 'Eșuat', en: 'Failed' },
  statusPlanning: { ro: 'Analizez cererea…', en: 'Analyzing request…' },
  statusStarting: { ro: 'Pornesc generarea…', en: 'Starting generation…' },
  panelTitle: { ro: 'Print 3D Chat', en: 'Print 3D Chat' },
  panelSubtitle: {
    ro: 'Descrie în cuvinte simple — AI traduce tehnic și generează STL',
    en: 'Describe in plain words — AI translates technically and generates STL',
  },
  clearChat: { ro: 'Șterge chat', en: 'Clear chat' },
  emptyState: {
    ro: 'Spune ce vrei să printezi — ex. roată 80mm, suport telefon, figurină cartoon.\nYou can also write in English: wheel 80mm, phone stand, cartoon mouse figure.',
    en: 'Say what you want to print — e.g. wheel 80mm, phone stand, cartoon mouse figure.\nPoți scrie și în română: roată 80mm, suport telefon, figurină cartoon.',
  },
  placeholder: {
    ro: 'Ce vrei să printezi? / What do you want to print?',
    en: 'What do you want to print? / Ce vrei să printezi?',
  },
  quality: { ro: 'Calitate', en: 'Quality' },
  qualityStandard: { ro: 'Standard (rapid)', en: 'Standard (fast)' },
  qualityHigh: { ro: 'High (detaliu maxim)', en: 'High (max detail)' },
  generateBtn: { ro: 'Trimite', en: 'Send' },
  generatingBtn: { ro: 'Lucrez…', en: 'Working…' },
  stop: { ro: 'Stop', en: 'Stop' },
  downloadStl: { ro: 'Download STL', en: 'Download STL' },
  exportScad: { ro: 'Export .scad', en: 'Export .scad' },
  scadSource: { ro: 'OpenSCAD sursă', en: 'OpenSCAD source' },
  userLabel: { ro: 'Tu', en: 'You' },
  assistantLabel: { ro: 'Print 3D AI', en: 'Print 3D AI' },
  meshOverhangNote: {
    ro: 'Verifică overhangs în slicer înainte de print.',
    en: 'Check overhangs in your slicer before printing.',
  },
  stlReady: {
    ro: 'Model STL gata.',
    en: 'STL model ready.',
  },
  stlReadyRefine: {
    ro: ' Poți descărca sau continua conversația pentru refinări.',
    en: ' You can download or continue the conversation to refine.',
  },
  dimensions: { ro: 'Dimensiuni', en: 'Dimensions' },
  examples: {
    ro: ['Roată 80mm', 'Suport telefon', 'Figurină cartoon 100mm'],
    en: ['Wheel 80mm', 'Phone stand', 'Cartoon figure 100mm'],
  },
} as const;

export type Print3DI18nKey = keyof typeof strings;

export function t(key: Print3DI18nKey, lang: Print3DLanguage): string {
  const entry = strings[key];
  if (typeof entry === 'object' && 'ro' in entry && 'en' in entry && !Array.isArray(entry)) {
    return entry[lang];
  }
  return String(entry);
}

export function statusLabel(
  status: string | null | undefined,
  lang: Print3DLanguage,
  generationMode?: 'openscad' | 'mesh' | null
): string {
  switch (status) {
    case 'queued':
      return t('statusQueued', lang);
    case 'generating':
      return generationMode === 'mesh'
        ? t('statusGeneratingMesh', lang)
        : generationMode === 'openscad'
          ? t('statusGeneratingScad', lang)
          : t('statusGenerating', lang);
    case 'rendering':
      return t('statusRendering', lang);
    case 'done':
      return t('statusDone', lang);
    case 'failed':
      return t('statusFailed', lang);
    default:
      return status ?? '';
  }
}

export function exampleChips(lang: Print3DLanguage): string[] {
  return [...strings.examples[lang]];
}
