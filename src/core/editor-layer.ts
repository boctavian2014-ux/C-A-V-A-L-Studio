export interface CoreEditorCapabilities {
  workspaceTrust: boolean;
  extensionHost: boolean;
  settingsSync: boolean;
  commandPalette: boolean;
}

export class CoreEditorLayer {
  readonly capabilities: CoreEditorCapabilities = {
    workspaceTrust: true,
    extensionHost: true,
    settingsSync: true,
    commandPalette: true
  };

  bootstrap(): CoreEditorCapabilities {
    return this.capabilities;
  }
}
