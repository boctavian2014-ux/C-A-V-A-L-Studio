import { describe, expect, it } from "vitest";
import { AccountService } from "../../src/cloud-services/accounts";
import { SyncService } from "../../src/cloud-services/sync";
import { TelemetryService } from "../../src/cloud-services/telemetry";

describe("cloud services", () => {
  it("AccountService stores signed-in account", () => {
    const accounts = new AccountService();
    accounts.signIn({
      id: "u1",
      email: "dev@caval.dev",
      displayName: "Dev",
      plan: "pro"
    });
    expect(accounts.getCurrentAccount()?.plan).toBe("pro");
  });

  it("SyncService pushes and pulls workspace data", async () => {
    const sync = new SyncService();
    await expect(sync.push(
      { endpoint: "https://sync.test", workspaceId: "ws-1" },
      { settings: {}, keybindings: {}, extensions: [] }
    )).resolves.toBeUndefined();
    const payload = await sync.pull({ endpoint: "https://sync.test", workspaceId: "ws-1" });
    expect(payload).toEqual({});
  });

  it("TelemetryService records and flushes events", () => {
    const telemetry = new TelemetryService();
    telemetry.record("test.run", { count: 103 });
    const flushed = telemetry.flush();
    expect(flushed.some((e) => e.name === "test.run")).toBe(true);
    expect(telemetry.flush()).toHaveLength(0);
  });
});
