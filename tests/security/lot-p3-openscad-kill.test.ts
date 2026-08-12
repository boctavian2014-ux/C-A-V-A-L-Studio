import { afterEach, describe, expect, it } from "vitest";
import {
  cancelJobProcessing,
  clearJobAbort,
  isJobAborted,
  registerJobAbort,
  resetJobRegistryForTests,
} from "../../engineering/cad-server/services/job-registry";

describe("P3 OpenSCAD abort registry", () => {
  afterEach(() => {
    resetJobRegistryForTests();
  });

  it("keeps a cancelled job aborted until it is cleared", () => {
    registerJobAbort("job-cancelled");

    expect(cancelJobProcessing("job-cancelled")).toBe(true);
    expect(isJobAborted("job-cancelled")).toBe(true);

    clearJobAbort("job-cancelled");
    expect(isJobAborted("job-cancelled")).toBe(false);
  });

  it("clears a stale abort flag when a fresh job starts", () => {
    registerJobAbort("job-fresh");
    cancelJobProcessing("job-fresh");
    expect(isJobAborted("job-fresh")).toBe(true);

    registerJobAbort("job-fresh");
    expect(isJobAborted("job-fresh")).toBe(false);
  });
});
