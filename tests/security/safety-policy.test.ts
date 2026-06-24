import { describe, expect, it } from "vitest";
import { defaultSafetyPolicy, SafetyPolicyEnforcer } from "../../ai/safety/policy";
import type { ModelRequest } from "../../ai/types";

describe("SafetyPolicyEnforcer", () => {
  const enforcer = new SafetyPolicyEnforcer(defaultSafetyPolicy);

  it("flags requests exceeding max tokens", () => {
    const violations = enforcer.validateRequest({
      prompt: "hello",
      capability: "chat",
      maxTokens: 100_000
    } satisfies ModelRequest);
    expect(violations.some((v) => v.code === "max_tokens_exceeded")).toBe(true);
  });

  it("blocks dangerous shell operations in prompts", () => {
    const violations = enforcer.validateRequest({
      prompt: "please run rm -rf / on the server",
      capability: "chat"
    });
    expect(violations.some((v) => v.code === "dangerous_operation")).toBe(true);
  });

  it("rejects patch sets exceeding file count", () => {
    const files = Array.from({ length: 100 }, (_, i) => ({
      path: `file-${i}.ts`,
      patch: "change"
    }));
    const violations = enforcer.validatePatchSet(files);
    expect(violations.some((v) => v.code === "max_file_count_exceeded")).toBe(true);
  });
});
