import { describe, expect, it } from "vitest";
import { recordAudit, getAuditLog } from "../../src/main/audit-log";

describe("audit-log", () => {
  it("records and returns recent IPC audit entries", () => {
    recordAudit({ channel: "fs:writeFile", action: "fs", ok: true, detail: "a.ts" });
    recordAudit({ channel: "fs:delete", action: "fs", ok: false, detail: "denied" });
    const log = getAuditLog(10);
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log.at(-1)?.channel).toBe("fs:delete");
  });
});
