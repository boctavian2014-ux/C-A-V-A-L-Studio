import { beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryCadJob,
  getMemoryCadJob,
  resetCadJobsForTests,
  updateMemoryCadJob,
} from "../../engineering/cad-server/memory-store";

describe("cad memory store", () => {
  beforeEach(() => {
    resetCadJobsForTests();
  });

  it("creates and updates jobs", () => {
    const job = createMemoryCadJob({
      prompt: "bracket",
      projectType: "robot",
      cavalId: "caval_test",
    });
    expect(job.status).toBe("queued");
    expect(job.prompt).toBe("bracket");

    const updated = updateMemoryCadJob(job.id, {
      status: "done",
      stlUrl: "https://example.com/model.stl",
      generatedScad: "cube(1);",
    });
    expect(updated?.status).toBe("done");
    expect(getMemoryCadJob(job.id)?.stlUrl).toBe("https://example.com/model.stl");
  });
});
