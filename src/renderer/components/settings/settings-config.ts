export type SettingsCategoryId =
  | 'general'
  | 'vscode'
  | 'plan'
  | 'agents'
  | 'tab'
  | 'models'
  | 'cloud'
  | 'plugins'
  | 'rules'
  | 'mcp'
  | 'hooks'
  | 'indexing'
  | 'network'
  | 'beta'
  | 'docs';

export interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  icon: string;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'general', label: 'General', icon: '⚙' },
  { id: 'vscode', label: 'VS Code Settings', icon: '⌘' },
  { id: 'plan', label: 'Plan & Usage', icon: '▣' },
  { id: 'agents', label: 'Agents', icon: '⌁' },
  { id: 'tab', label: 'Tab', icon: '↹' },
  { id: 'models', label: 'Models', icon: '◉' },
  { id: 'cloud', label: 'Cloud Agents', icon: '☁' },
  { id: 'plugins', label: 'Plugins', icon: '⌘' },
  { id: 'rules', label: 'Rules, Skills, Subagents', icon: '▤' },
  { id: 'mcp', label: 'Tools & MCPs', icon: '◆' },
  { id: 'hooks', label: 'Hooks', icon: '⚡' },
  { id: 'indexing', label: 'Indexing & Docs', icon: '◫' },
  { id: 'network', label: 'Network', icon: '◎' },
  { id: 'beta', label: 'Beta', icon: '⚗' },
  { id: 'docs', label: 'Docs', icon: '□' },
];

export interface SettingsActionItem {
  title: string;
  description: string;
  action: string;
  cta: string;
  navigateTo?: SettingsCategoryId;
}

export const SETTINGS_ACTION_PAGES: Partial<Record<SettingsCategoryId, SettingsActionItem[]>> = {
  vscode: [
    {
      title: 'Import VS Code settings',
      description: 'Importă settings.json, keybindings și snippets.',
      action: 'import-vscode-settings',
      cta: 'Import',
    },
    {
      title: 'Open settings JSON',
      description: 'Editează setările brute compatibile VS Code.',
      action: 'open-settings-json',
      cta: 'Open JSON',
    },
  ],
  plan: [
    {
      title: 'Current plan',
      description: 'Vezi planul activ și opțiunile de upgrade Stripe.',
      action: 'open-plan',
      cta: 'View Plan',
      navigateTo: 'plan',
    },
    {
      title: 'Usage',
      description: 'Cereri AI, build minutes și marketplace sync.',
      action: 'open-usage',
      cta: 'View Usage',
      navigateTo: 'plan',
    },
  ],
  agents: [
    {
      title: 'Composer Agent',
      description: 'Planifică și aplică modificări multi-file.',
      action: 'agent-composer',
      cta: 'Configure',
    },
    {
      title: 'Debug Agent',
      description: 'Analizează erori și propune fix-uri.',
      action: 'agent-debug',
      cta: 'Configure',
    },
  ],
  tab: [
    {
      title: 'Tab autocomplete',
      description: 'Activează completări rapide în editor.',
      action: 'tab-autocomplete',
      cta: 'Enable',
    },
    {
      title: 'Inline edits',
      description: 'Sugestii AI inline în editor.',
      action: 'inline-edits',
      cta: 'Enable',
    },
  ],
  cloud: [
    {
      title: 'Caval Cloud endpoint',
      description: 'Conectează agenții la Caval Cloud.',
      action: 'cloud-agent-endpoint',
      cta: 'Connect',
    },
    {
      title: 'Remote runs',
      description: 'Rulează taskuri grele în cloud.',
      action: 'remote-runs',
      cta: 'Configure',
    },
  ],
  plugins: [
    {
      title: 'Installed plugins',
      description: 'Administrează pluginurile instalate.',
      action: 'plugins-installed',
      cta: 'Open',
    },
    {
      title: 'Marketplace plugins',
      description: 'Caută pluginuri noi.',
      action: 'plugins-marketplace',
      cta: 'Browse',
    },
  ],
  rules: [
    {
      title: 'Project rules',
      description: 'Reguli persistente pentru AI.',
      action: 'rules',
      cta: 'Open Rules',
    },
    {
      title: 'Subagents',
      description: 'Configurează agenți specializați.',
      action: 'subagents',
      cta: 'Configure',
    },
  ],
  mcp: [
    {
      title: 'MCP servers',
      description: 'Administrează servere MCP din caval.jsonc.',
      action: 'mcp-servers',
      cta: 'Open MCPs',
      navigateTo: 'mcp',
    },
    {
      title: 'Tool permissions',
      description: 'Controlează permisiunile tool-urilor.',
      action: 'tool-permissions',
      cta: 'Configure',
      navigateTo: 'mcp',
    },
  ],
  hooks: [
    {
      title: 'Agent hooks',
      description: 'Automatizări la evenimente agent.',
      action: 'agent-hooks',
      cta: 'Configure',
    },
    {
      title: 'Build hooks',
      description: 'Rulează validări la build/release.',
      action: 'build-hooks',
      cta: 'Configure',
    },
  ],
  indexing: [
    {
      title: 'Reindex workspace',
      description: 'Reconstruiește Context Engine index.',
      action: 'reindex',
      cta: 'Reindex',
    },
    {
      title: 'Docs sources',
      description: 'Alege ce documentație intră în context.',
      action: 'docs-sources',
      cta: 'Configure',
    },
  ],
  network: [
    {
      title: 'Proxy',
      description: 'Configurează proxy pentru cloud și marketplace.',
      action: 'network-proxy',
      cta: 'Configure',
    },
    {
      title: 'Offline mode',
      description: 'Folosește doar modele locale.',
      action: 'offline-mode',
      cta: 'Enable',
    },
  ],
  beta: [
    {
      title: 'Beta features',
      description: 'Activează funcții experimentale Caval.',
      action: 'beta-features',
      cta: 'Enable',
    },
    {
      title: 'Nightly channel',
      description: 'Primește update-uri nightly.',
      action: 'nightly-channel',
      cta: 'Switch',
    },
  ],
  docs: [
    {
      title: 'Caval docs',
      description: 'Deschide documentația locală.',
      action: 'docs-open',
      cta: 'Open Docs',
    },
    {
      title: 'Generate docs',
      description: 'Folosește AI pentru README și docs.',
      action: 'docs-generate',
      cta: 'Generate',
    },
  ],
};

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  control: 'text' | 'number' | 'select' | 'toggle' | 'password';
  defaultValue: string;
  options?: string[];
  section: string;
  categories: SettingsCategoryId[];
}

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: 'editor.fontSize',
    label: 'Editor: Font Size',
    description: 'Controls the font size in pixels.',
    control: 'number',
    defaultValue: '14',
    section: 'Commonly Used',
    categories: ['general'],
  },
  {
    key: 'editor.wordWrap',
    label: 'Editor: Word Wrap',
    description: 'Controls how lines should wrap.',
    control: 'select',
    defaultValue: 'off',
    options: ['off', 'on', 'wordWrapColumn'],
    section: 'Commonly Used',
    categories: ['general'],
  },
  {
    key: 'files.autoSave',
    label: 'Files: Auto Save',
    description: 'Controls auto save for dirty editors.',
    control: 'select',
    defaultValue: 'off',
    options: ['off', 'afterDelay', 'onFocusChange'],
    section: 'Commonly Used',
    categories: ['general'],
  },
  {
    key: 'workbench.colorTheme',
    label: 'Workbench: Color Theme',
    description: 'Preferred Caval Studio theme.',
    control: 'select',
    defaultValue: 'Caval Dark',
    options: ['Caval Dark', 'Caval Ivory'],
    section: 'Workbench',
    categories: ['general'],
  },
  {
    key: 'workbench.sideBar.location',
    label: 'Workbench: Side Bar Location',
    description: 'Controls the location of the primary side bar.',
    control: 'select',
    defaultValue: 'left',
    options: ['left', 'right'],
    section: 'Workbench',
    categories: ['general'],
  },
  {
    key: 'ollama.url',
    label: 'Ollama URL',
    description: 'Local Ollama endpoint for BYOK models.',
    control: 'text',
    defaultValue: 'http://localhost:11434',
    section: 'AI',
    categories: ['general', 'models', 'network'],
  },
  {
    key: 'caval.ai.mode',
    label: 'Caval AI: Default Mode',
    description: 'Ask for quick answers or Plan for structured changes.',
    control: 'select',
    defaultValue: 'ask',
    options: ['ask', 'plan'],
    section: 'AI',
    categories: ['general', 'agents'],
  },
  {
    key: 'caval.ai.localFallback',
    label: 'Caval AI: Local Fallback',
    description: 'Use Ollama when cloud is unavailable.',
    control: 'toggle',
    defaultValue: 'true',
    section: 'AI',
    categories: ['general', 'network'],
  },
  {
    key: 'openrouter.apiKey',
    label: 'OpenRouter API Key',
    description: 'For cloud free/paid models via OpenRouter.',
    control: 'password',
    defaultValue: '',
    section: 'AI',
    categories: ['models'],
  },
  {
    key: 'mesh.apiKey',
    label: 'Meshy API Key',
    description: 'For organic/character 3D mesh generation (Print 3D Chat).',
    control: 'password',
    defaultValue: '',
    section: 'AI',
    categories: ['models'],
  },
  {
    key: 'caval.cloud.apiKey',
    label: 'Caval Cloud API Key',
    description: 'Caval Cloud routing and agents.',
    control: 'password',
    defaultValue: '',
    section: 'AI',
    categories: ['models', 'cloud'],
  },
  {
    key: 'terminal.integrated.fontSize',
    label: 'Terminal: Font Size',
    description: 'Controls the terminal font size.',
    control: 'number',
    defaultValue: '12',
    section: 'Terminal',
    categories: ['general'],
  },
  {
    key: 'marketplace.extensions.autoUpdate',
    label: 'Marketplace: Auto Update',
    description: 'Automatically update installed extensions.',
    control: 'toggle',
    defaultValue: 'true',
    section: 'Marketplace',
    categories: ['plugins'],
  },
];
