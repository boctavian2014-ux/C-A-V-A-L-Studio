export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  engines: {
    vscode?: string;
    caval?: string;
  };
}

export class CavalExtensionHost {
  private readonly installedExtensions = new Map<string, ExtensionManifest>();

  register(manifest: ExtensionManifest): void {
    this.installedExtensions.set(manifest.id, manifest);
  }

  list(): ExtensionManifest[] {
    return [...this.installedExtensions.values()];
  }
}
