import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtureClock = () => 1800000000000;

test("repair hazards survive a scoped pull until a conflict is saved", async () => {
  const { pendingRepairs, savePendingRepairs, consumeRepair } =
    await import("../remote/repairs.ts");

  const home = await mkdtemp(join(tmpdir(), "envden-pending-repair-"));

  try {
    await savePendingRepairs(home, new Set(["repo-a", "repo-b"]), fixtureClock);
    await consumeRepair(home, "repo-a", fixtureClock);
    expect([...(await pendingRepairs(home))]).toEqual(["repo-b"]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
