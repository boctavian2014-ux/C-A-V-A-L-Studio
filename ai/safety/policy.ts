import type { ModelRequest } from "../types";

export interface SafetyPolicy {
  maxTokens: number;
  maxPatchBytes: number;
  maxFileCount: number;
  maxRequestsPerMinute: number;
  blockedOperations: string[];
  blockedPatterns: RegExp[];
}

export interface SafetyViolation {
  code: string;
  message: string;
}

export const defaultSafetyPolicy: SafetyPolicy = {
  maxTokens: 32_000,
  maxPatchBytes: 512_000,
  maxFileCount: 80,
  maxRequestsPerMinute: 60,
  blockedOperations: [
    "rm -rf",
    "del /s",
    "git reset --hard",
    "git clean -fd",
    "shutdown",
    "cipher /w",
    "reg delete"
  ],
  blockedPatterns: [
    /\bformat\s+[a-z]:/i,
    /\bformat\s+\/[a-z]/i,
  ]
};

export class SafetyPolicyEnforcer {
  constructor(private readonly policy: SafetyPolicy = defaultSafetyPolicy) {}

  validateRequest(request: ModelRequest): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    const requestedTokens = request.maxTokens ?? 0;

    if (requestedTokens > this.policy.maxTokens) {
      violations.push({
        code: "max_tokens_exceeded",
        message: `Requested maxTokens ${requestedTokens} exceeds policy limit ${this.policy.maxTokens}.`
      });
    }

    const payload = `${request.system ?? ""}\n${request.prompt}\n${JSON.stringify(request.context ?? {})}`;
    for (const operation of this.policy.blockedOperations) {
      if (payload.toLowerCase().includes(operation.toLowerCase())) {
        violations.push({
          code: "dangerous_operation",
          message: `Blocked dangerous operation pattern: ${operation}`
        });
      }
    }

    for (const pattern of this.policy.blockedPatterns) {
      if (pattern.test(payload)) {
        violations.push({
          code: "dangerous_operation",
          message: `Blocked dangerous operation pattern: ${pattern.source}`
        });
      }
    }

    return violations;
  }

  validatePatchSet(files: Array<{ path: string; patch: string }>): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.patch, "utf8"), 0);

    if (files.length > this.policy.maxFileCount) {
      violations.push({
        code: "max_file_count_exceeded",
        message: `Patch touches ${files.length} files, limit is ${this.policy.maxFileCount}.`
      });
    }

    if (totalBytes > this.policy.maxPatchBytes) {
      violations.push({
        code: "max_patch_size_exceeded",
        message: `Patch size ${totalBytes} bytes exceeds limit ${this.policy.maxPatchBytes}.`
      });
    }

    return violations;
  }
}
