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
      // Lot C2 — installed-only / disabled until SEC-EXT-RUNTIME-PERMISSIONS-001.
      enabled: false,
      installedAt: new Date().toISOString()
    };
    this.extensions.set(id, installed);
    return installed;
  }

  uninstall(extensionId: string): void {
    this.extensions.delete(extensionId);
  }

  /** Intentionally a no-op: enabling/running extension code is blocked until runtime permissions ticket. */
  enable(extensionId: string): void {
    void extensionId;
    /* no-op — see docs/security/SEC-EXT-RUNTIME-PERMISSIONS-001.md */
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
