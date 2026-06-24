import { describe, expect, it } from "vitest";
import { assertShellCommandAllowed } from "./shell-security";

describe("assertShellCommandAllowed", () => {
  it("allows npm run scripts", () => {
    expect(() => assertShellCommandAllowed("npm run typecheck")).not.toThrow();
  });

  it("blocks arbitrary commands", () => {
    expect(() => assertShellCommandAllowed("rm -rf /")).toThrow();
  });
});
