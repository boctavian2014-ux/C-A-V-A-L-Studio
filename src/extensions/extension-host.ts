/**
 * In-memory registry of installed extensions.
 * Lot C2: extensions are installed-only / disabled — no code execution API.
 * Activation requires SEC-EXT-RUNTIME-PERMISSIONS-001.
 */

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  engines: {
    vscode?: string;
    caval?: string;
  };
  /** Always false until runtime permission model exists. */
  enabled?: false;
  status?: "installed";
  source?: "openvsx" | "marketplace" | "disk";
  sha256?: string;
}

export type ExtensionListEntry = ExtensionManifest & {
  enabled: false;
  status: "installed";
};

export class CavalExtensionHost {
  private readonly installedExtensions = new Map<string, ExtensionListEntry>();

  register(manifest: ExtensionManifest): ExtensionListEntry {
    const entry: ExtensionListEntry = {
      ...manifest,
      enabled: false,
      status: "installed",
      source: manifest.source ?? "disk",
    };
    this.installedExtensions.set(manifest.id, entry);
    return entry;
  }

  list(): ExtensionListEntry[] {
    return [...this.installedExtensions.values()].map((e) => ({
      ...e,
      enabled: false,
      status: "installed",
    }));
  }

  clear(): void {
    this.installedExtensions.clear();
  }
}
