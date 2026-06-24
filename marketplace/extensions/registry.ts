import type { ExtensionManifest } from "./manifest-validator";

export interface InstalledExtension {
  id: string;
  version: string;
  manifest: ExtensionManifest;
  enabled: boolean;
  installedAt: string;
}

export class InstalledExtensionRegistry {
  private readonly extensions = new Map<string, InstalledExtension>();

  install(manifest: ExtensionManifest): InstalledExtension {
    const id = `${manifest.publisher}.${manifest.name}`;
    const installed: InstalledExtension = {
      id,
      version: manifest.version,
      manifest,
      enabled: true,
      installedAt: new Date().toISOString()
    };
    this.extensions.set(id, installed);
    return installed;
  }

  uninstall(extensionId: string): void {
    this.extensions.delete(extensionId);
  }

  enable(extensionId: string): void {
    const extension = this.extensions.get(extensionId);
    if (extension) {
      this.extensions.set(extensionId, { ...extension, enabled: true });
    }
  }

  disable(extensionId: string): void {
    const extension = this.extensions.get(extensionId);
    if (extension) {
      this.extensions.set(extensionId, { ...extension, enabled: false });
    }
  }

  list(): InstalledExtension[] {
    return [...this.extensions.values()];
  }
}
