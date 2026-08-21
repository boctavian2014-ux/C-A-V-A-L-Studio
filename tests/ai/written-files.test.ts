import { describe, expect, it } from "vitest";

import {
  formatWrittenFilesHeadline,
  joinWorkspaceRelativePath,
} from "../../ai/composer/written-files";

describe("written-files", () => {
  it("joins relative paths on Windows roots", () => {
    expect(joinWorkspaceRelativePath("C:\\proj", "api/matching_service.py")).toBe(
      "C:\\proj\\api\\matching_service.py"
    );
  });

  it("joins relative paths on posix roots", () => {
    expect(joinWorkspaceRelativePath("/home/me/app", "src/fashion_matching/scoring.py")).toBe(
      "/home/me/app/src/fashion_matching/scoring.py"
    );
  });

  it("formats the completion headline without truncating names", () => {
    expect(formatWrittenFilesHeadline(8)).toBe("✓ 8 fișier(e) create în workspace");
  });
});
