import type { ExtensionManifest } from "./manifest-validator";

export interface CompatibilityReport {
  compatible: boolean;
  source: "caval" | "vscode" | "unknown";
  warnings: string[];
  convertedManifest: ExtensionManifest;
}

export class ExtensionCompatibility {
  analyze(manifest: ExtensionManifest): CompatibilityReport {
    const warnings: string[] = [];
    const source = manifest.engines.caval ? "caval" : manifest.engines.vscode ? "vscode" : "unknown";

    if (source === "vscode" && !manifest.engines.caval) {
      warnings.push("VS Code extension will run through the Caval compatibility adapter.");
    }

    return {
      compatible: source !== "unknown",
      source,
      warnings,
      convertedManifest: this.convert(manifest)
    };
  }

  convert(manifest: ExtensionManifest): ExtensionManifest {
    return {
      ...manifest,
      engines: {
        ...manifest.engines,
        caval: manifest.engines.caval ?? "^0.1.0"
      }
    };
  }
}
