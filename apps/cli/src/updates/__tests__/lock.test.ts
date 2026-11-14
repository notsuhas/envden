import { processIdentity } from "../../state/lock/process.ts";
import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withUpdateLock } from "../self/lock.ts";

test("update reclaims a prior boot's lock without waiting a day", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-update-boot-"));
  const lock = join(home, "state", "update", "state", "write.lock");

  try {
    await mkdir(lock, { recursive: true });

    await writeFile(
      join(lock, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        token: "prior",
        startedAt: "prior-start",
        identity: JSON.stringify({
          ...JSON.parse((await processIdentity())!),
          boot: "previous-boot",
        }),
        createdAt: Number.MAX_SAFE_INTEGER,
      }),
    );

    expect(await withUpdateLock(home, async () => "acquired")).toBe("acquired");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("update preserves a live lock from another host", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-update-host-"));
  const lock = join(home, "state", "update", "state", "write.lock");

  try {
    await mkdir(lock, { recursive: true });

    await writeFile(
      join(lock, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        token: "live",
        startedAt: "live",
        identity: JSON.stringify({ host: "other", boot: "same" }),
        createdAt: Number.MAX_SAFE_INTEGER,
      }),
    );

    await Promise.resolve(
      expect(withUpdateLock(home, async () => "acquired")).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Another envden update is running",
      }),
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
