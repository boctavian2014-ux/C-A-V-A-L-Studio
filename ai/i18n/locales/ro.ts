import type { MessageCatalog } from "./en";

/** Romanian UI strings — must cover every English key. */
export const ro = {
  "nav.explorer": "Explorer",
  "nav.search": "Căutare",
  "nav.sourceControl": "Control sursă",
  "nav.marketplace": "Marketplace",
  "nav.ai": "AI",
  "nav.settings": "Setări",

  "nav.explorerShortcut": "Explorer (Ctrl+Shift+E)",
  "nav.searchShortcut": "Căutare (Ctrl+Shift+F)",
  "nav.sourceControlShortcut": "Control sursă (Ctrl+Shift+G)",
  "nav.marketplaceShortcut": "Marketplace (Ctrl+Shift+X)",
  "nav.aiShortcut": "Panou AI (Ctrl+Shift+A)",
  "nav.settingsShortcut": "Setări (Ctrl+,)",

  "common.save": "Salvează",
  "common.cancel": "Anulează",
  "common.close": "Închide",
  "common.loading": "Se încarcă",
  "common.retry": "Reîncearcă",
  "common.error": "Eroare",
  "common.openFolder": "Deschide folder",

  "settings.nav.general": "General",
  "settings.appearance": "Aspect",
  "settings.theme": "Temă",
  "settings.themeDesc": "Dark sau light pentru întreaga aplicație",
  "settings.displayLanguage": "Limba afișată",
  "settings.displayLanguageHint": "Se aplică imediat.",
  "settings.localeChanged": "Limba a fost actualizată.",

  "activity.status.notConfigured": "{{title}} — Neconfigurat",
  "activity.status.running": "{{title}} — Rulează",
  "activity.status.starting": "{{title}} — Pornire",
  "activity.status.failed": "{{title}} — Eșuat",

  "confirm.deleteFile": "Ștergi \"{{name}}\"?",
  "explorer.openFolderHint": "Deschide un folder pentru a începe",

  "toast.dismiss": "Închide notificarea",
} as const satisfies MessageCatalog;
