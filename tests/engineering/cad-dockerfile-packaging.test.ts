import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CAD Dockerfile packaging", () => {
  const root = process.cwd();
  const dockerfile = fs.readFileSync(
    path.join(root, "engineering/cad-server/Dockerfile"),
    "utf8"
  );
  const redactionPath = path.join(root, "src/shared/command-output-redaction.ts");

  it("copies command-output-redaction onto the import path used at CAD boot", () => {
    expect(fs.existsSync(redactionPath)).toBe(true);
    expect(fs.readFileSync(redactionPath, "utf8")).not.toMatch(/^import /m);
    expect(dockerfile).toMatch(
      /COPY src\/shared\/command-output-redaction\.ts \.\/src\/shared\/command-output-redaction\.ts/
    );
    expect(dockerfile).not.toMatch(/^COPY \. \./m);
  });

  it("does not copy the whole repository into the CAD image", () => {
    const copyLines = dockerfile
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("COPY "));
    expect(copyLines.some((line) => line === "COPY . ." || line === "COPY . ./")).toBe(
      false
    );
  });
});
