import { requiredString, validateSemverLike, validationResult, type ValidationResult } from "../server/utils/validator";

export interface ExtensionManifest {
  name: string;
  publisher: string;
  version: string;
  displayName?: string;
  description?: string;
  engines: {
    vscode?: string;
    caval?: string;
  };
  categories?: string[];
  keywords?: string[];
  activationEvents?: string[];
  contributes?: Record<string, unknown>;
  cavalPermissions?: string[];
}

export const validateExtensionManifest = (manifest: Record<string, unknown>): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  requiredString(manifest.name, "name", errors);
  requiredString(manifest.publisher, "publisher", errors);
  validateSemverLike(manifest.version, "version", errors);

  const engines = manifest.engines as ExtensionManifest["engines"] | undefined;
  if (!engines?.vscode && !engines?.caval) {
    errors.push("engines.vscode or engines.caval is required.");
  }

  if (!manifest.description) {
    warnings.push("description is recommended for marketplace discovery.");
  }

  return validationResult(errors, warnings);
};
