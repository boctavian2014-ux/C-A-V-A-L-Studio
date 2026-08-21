/** English UI strings — source of truth for message keys (7g.1 scope). */
export const en = {
  "nav.explorer": "Explorer",
  "nav.search": "Search",
  "nav.sourceControl": "Source Control",
  "nav.marketplace": "Marketplace",
  "nav.ai": "AI",
  "nav.settings": "Settings",

  "nav.explorerShortcut": "Explorer (Ctrl+Shift+E)",
  "nav.searchShortcut": "Search (Ctrl+Shift+F)",
  "nav.sourceControlShortcut": "Source Control (Ctrl+Shift+G)",
  "nav.marketplaceShortcut": "Marketplace (Ctrl+Shift+X)",
  "nav.aiShortcut": "AI Panel (Ctrl+Shift+A)",
  "nav.settingsShortcut": "Settings (Ctrl+,)",

  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.loading": "Loading",
  "common.retry": "Retry",
  "common.error": "Error",
  "common.openFolder": "Open folder",

  "settings.nav.general": "General",
  "settings.appearance": "Appearance",
  "settings.theme": "Theme",
  "settings.themeDesc": "Dark or light for the whole app",
  "settings.displayLanguage": "Display language",
  "settings.displayLanguageHint": "Applies immediately.",
  "settings.localeChanged": "Language updated.",

  "activity.status.notConfigured": "{{title}} — Not configured",
  "activity.status.running": "{{title}} — Running",
  "activity.status.starting": "{{title}} — Starting",
  "activity.status.failed": "{{title}} — Failed",

  "confirm.deleteFile": "Delete \"{{name}}\"?",
  "explorer.openFolderHint": "Open a folder to get started",

  "toast.dismiss": "Dismiss notification",
} as const;

export type MessageKey = keyof typeof en;
export type MessageCatalog = Record<MessageKey, string>;
