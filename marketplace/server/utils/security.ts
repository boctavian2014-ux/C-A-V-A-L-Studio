export interface SecurityReport {
  safe: boolean;
  findings: string[];
  permissions: string[];
  sandboxRequired: boolean;
}

const dangerousPatterns = [
  "child_process",
  "eval(",
  "Function(",
  "process.env",
  "fs.rm",
  "fs.unlink",
  "net.connect",
  "http.request"
];

export class MarketplaceSecurity {
  scanManifest(manifest: Record<string, unknown>): SecurityReport {
    const serialized = JSON.stringify(manifest);
    const findings = dangerousPatterns
      .filter((pattern) => serialized.includes(pattern))
      .map((pattern) => `Potentially dangerous capability found: ${pattern}`);
    const permissions = this.extractPermissions(manifest);

    findings.push(...permissions
      .filter((permission) => !this.permissionAllowed(permission))
      .map((permission) => `Permission requires manual review: ${permission}`));

    return {
      safe: findings.length === 0,
      findings,
      permissions,
      sandboxRequired: permissions.length > 0
    };
  }

  sandboxPolicy(manifest: Record<string, unknown>): Record<string, boolean> {
    const permissions = this.extractPermissions(manifest);
    return {
      filesystem: permissions.includes("filesystem"),
      network: permissions.includes("network"),
      shell: false,
      workspaceTrustRequired: permissions.includes("workspace")
    };
  }

  private extractPermissions(manifest: Record<string, unknown>): string[] {
    const permissions = manifest.cavalPermissions;
    return Array.isArray(permissions) ? permissions.map(String) : [];
  }

  private permissionAllowed(permission: string): boolean {
    return ["workspace", "filesystem", "network", "ai", "context-engine"].includes(permission);
  }
}
