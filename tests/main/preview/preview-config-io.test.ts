import { describe, expect, it } from "vitest";

import { stripJsonc } from "../../../src/main/preview-config-io";

describe("stripJsonc", () => {
  it("preserves URLs with // inside strings", () => {
    const input = `{
      "url": "http://localhost:5173" // comment
    }`;
    const output = stripJsonc(input);
    expect(output).toContain('"url": "http://localhost:5173"');
    expect(output).not.toContain("// comment");
    expect(JSON.parse(output)).toEqual({ url: "http://localhost:5173" });
  });

  it("strips block comments", () => {
    const input = `{
      /* block */ "key": "value"
    }`;
    const output = stripJsonc(input);
    expect(output).toContain('"key": "value"');
    expect(output).not.toContain("block");
    expect(JSON.parse(output)).toEqual({ key: "value" });
  });

  it("handles escaped quotes in strings", () => {
    const input = '{ "msg": "say \\"hello\\" // not a comment" }';
    const output = stripJsonc(input);
    expect(output).toContain("// not a comment");
    expect(JSON.parse(output)).toEqual({ msg: 'say "hello" // not a comment' });
  });
});
