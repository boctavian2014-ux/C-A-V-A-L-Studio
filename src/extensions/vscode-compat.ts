export interface CompatibilityResult {
  compatible: boolean;
  warnings: string[];
}

export const checkVSCodeCompatibility = (engines: { vscode?: string; caval?: string }): CompatibilityResult => {
  const warnings: string[] = [];

  if (!engines.vscode && !engines.caval) {
    warnings.push("Extension manifest should declare vscode or caval engine compatibility.");
  }

  return {
    compatible: warnings.length === 0,
    warnings
  };
};
