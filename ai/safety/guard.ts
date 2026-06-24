import { defaultSafetyPolicy, SafetyPolicyEnforcer } from "./policy";
import { RateLimiter } from "./rate-limiter";
import type { ModelRequest } from "../types";

export class SafetyGuard {
  private readonly enforcer = new SafetyPolicyEnforcer(defaultSafetyPolicy);
  private readonly limiter = new RateLimiter(defaultSafetyPolicy.maxRequestsPerMinute);

  assertRequestAllowed(request: ModelRequest): void {
    const rateKey = request.metadata?.workspaceRoot ?? "global";
    if (!this.limiter.consume(rateKey)) {
      throw new Error("AI rate limit exceeded. Try again after the current minute window resets.");
    }

    const violations = this.enforcer.validateRequest(request);
    if (violations.length > 0) {
      throw new Error(violations.map((violation) => violation.message).join("\n"));
    }
  }

  assertPatchAllowed(files: Array<{ path: string; patch: string }>): void {
    const violations = this.enforcer.validatePatchSet(files);
    if (violations.length > 0) {
      throw new Error(violations.map((violation) => violation.message).join("\n"));
    }
  }
}
