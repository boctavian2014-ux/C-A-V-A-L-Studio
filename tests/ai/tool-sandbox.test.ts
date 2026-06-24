import { describe, expect, it } from "vitest";
import { toolSandbox } from "../../ai/pipeline/tool-sandbox";

describe("ToolSandbox", () => {
  it("rejects replay without confirmation", async () => {
    const result = await toolSandbox.run({
      toolCallId: "t1",
      tool: "npm.script",
      confirm: false
    }, process.cwd());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/confirmation/i);
  });

  it("rejects disallowed tools", async () => {
    const result = await toolSandbox.run({
      toolCallId: "t2",
      tool: "shell.rm",
      confirm: true
    }, process.cwd());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not allowed/i);
  });

  it("blocks shell metacharacters in mapped commands", async () => {
    const result = await toolSandbox.run({
      toolCallId: "t3",
      tool: "npm.script",
      input: { script: "build; rm -rf /" },
      confirm: true
    }, process.cwd());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Blocked shell metacharacters/);
  });
});
