import { MarketplaceSecurity } from "../server/utils/security";
import { ExtensionCompatibility } from "./compatibility";
import type { ExtensionManifest } from "./manifest-validator";
import { validateExtensionManifest } from "./manifest-validator";
import { InstalledExtensionRegistry } from "./registry";

export interface LoadResult {
  loaded: boolean;
  extensionId?: string;
  diagnostics: string[];
}

export class ExtensionLoader {
  constructor(
    private readonly registry = new InstalledExtensionRegistry(),
    private readonly compatibility = new ExtensionCompatibility(),
    private readonly security = new MarketplaceSecurity()
  ) {}

  load(manifest: ExtensionManifest): LoadResult {
    const validation = validateExtensionManifest(manifest as unknown as Record<string, unknown>);
    const compatibility = this.compatibility.analyze(manifest);
    const security = this.security.scanManifest(manifest as unknown as Record<string, unknown>);
    const diagnostics = [...validation.errors, ...validation.warnings, ...compatibility.warnings, ...security.findings];

    if (!validation.valid || !compatibility.compatible || !security.safe) {
      return {
        loaded: false,
        diagnostics
      };
    }

    const installed = this.registry.install(compatibility.convertedManifest);
    return {
      loaded: true,
      extensionId: installed.id,
      diagnostics: security.sandboxRequired ? [...diagnostics, "Extension loaded with sandbox policy."] : diagnostics
    };
  }

  installed(): InstalledExtensionRegistry {
    return this.registry;
  }
}
