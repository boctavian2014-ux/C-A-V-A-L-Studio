import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { watchWorkspace } from "../../../src/main/workspace/file-watcher";
import {
  loadWorkspaceIndex,
  saveWorkspaceIndex,
} from "../../../src/main/workspace/workspace-index-store";
import { WorkspaceIndexService } from "../../../src/main/workspace/workspace-index-service";
import { scanWorkspace } from "../../../src/main/workspace/workspace-scan";

describe("7d.1 workspace file watcher + persistence", () => {
  const roots: string[] = [];
  const stops: Array<() => void> = [];

  afterEach(async () => {
    for (const stop of stops.splice(0)) stop();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
  }

  it("watcher debounces and fires upsert for an indexable file", async () => {
    const root = tempRoot("caval-7d1-watch-");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "seed.ts"), `export const seed = 1;\n`);

    const upserts: string[] = [];
    const removes: string[] = [];
    const stop = watchWorkspace(
      root,
      {
        onUpsert: (rel) => upserts.push(rel),
        onRemove: (rel) => removes.push(rel),
      },
      { debounceMs: 50 }
    );
    stops.push(stop);

    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(path.join(root, "src", "watched.ts"), `export function watched() {}\n`);

    const deadline = Date.now() + 3000;
    while (!upserts.includes("src/watched.ts") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 40));
    }
    expect(upserts).toContain("src/watched.ts");

    fs.unlinkSync(path.join(root, "src", "watched.ts"));
    while (!removes.includes("src/watched.ts") && Date.now() < deadline + 2000) {
      await new Promise((r) => setTimeout(r, 40));
    }
    expect(removes).toContain("src/watched.ts");
  });

  it("deleted file is removed from service index and persisted cache updates", async () => {
    const root = tempRoot("caval-7d1-rm-");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "keep.ts"), `export const keep = 1;\n`);
    fs.writeFileSync(path.join(root, "src", "drop.ts"), `export const drop = 1;\n`);

    const service = new WorkspaceIndexService();
    await service.openWorkspace(root);
    await service.waitUntilIdle();
    expect(service.getIndex().totalFiles).toBe(2);

    fs.unlinkSync(path.join(root, "src", "drop.ts"));
    await service.reindexPath("src/drop.ts");
    expect(service.getIndex().files.map((f) => f.path)).toEqual(["src/keep.ts"]);

    await saveWorkspaceIndex(root, service.getIndex());
    const loaded = await loadWorkspaceIndex(root);
    expect(loaded?.files.map((f) => f.path)).toEqual(["src/keep.ts"]);
    await service.close();
  });

  it("reload after restart uses persisted index until refresh", async () => {
    const root = tempRoot("caval-7d1-reload-");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "a.ts"), `export const a = 1;\n`);
    const scanned = await scanWorkspace(root);
    await saveWorkspaceIndex(root, scanned);

    const service = new WorkspaceIndexService();
    const summary = await service.openWorkspace(root);
    expect(summary.totalFiles).toBeGreaterThanOrEqual(1);
    expect(service.getIndex().files[0]?.path).toBe("src/a.ts");
    await service.waitUntilIdle();
    await service.close();
  });
});
