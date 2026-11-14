import { processIdentity } from "../lock/process.ts";
import { withStateLock } from "../lock/lock.ts";
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rename, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reclaimLock } from "../lock/reclaim.ts";
import { reclaimable } from "../lock/owner.ts";

test("a suspended reclaimer preserves the replacement owner", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-race-"));
  const path = join(home, "lock");

  try {
    await mkdir(path);
    await writeFile(join(path, "owner.json"), JSON.stringify({ pid: 123, token: "old" }));

    expect(
      await reclaimLock(path, "old", 100, async () => {
        await rename(path, join(home, "old"));
        await mkdir(path);
        await writeFile(join(path, "owner.json"), JSON.stringify({ pid: 124, token: "new" }));
      }),
    ).toBe(false);

    expect(JSON.parse(await readFile(join(path, "owner.json"), "utf8")).token).toBe("new");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("foreign namespaces use age even when their PID looks dead", () => {
  const previous = { pid: 123, token: "owner", identity: "container", createdAt: 100 };
  expect(reclaimable(previous, { kind: "dead" }, "host", 101)).toBe(false);
  expect(reclaimable(previous, { kind: "dead" }, "container", 101)).toBe(true);
  expect(reclaimable(previous, { kind: "live", startedAt: "same" }, "host", 86400101)).toBe(true);
});

for (const crash of ["guard", "renamed"])
  test(`reclaim recovers after a crash at ${crash}`, async () => {
    const { lstat, rename } = await import("node:fs/promises");
    const home = await mkdtemp(join(tmpdir(), "envden-reclaim-"));
    const path = join(home, "state", "write.lock");

    try {
      await mkdir(join(path, "reclaim"), { recursive: true });

      await writeFile(
        join(path, "owner.json"),
        JSON.stringify({ pid: 2147483647, token: "dead", identity: await processIdentity() }),
      );

      const created = (await lstat(join(path, "reclaim"))).mtimeMs;
      if (crash === "renamed") await rename(path, `${path}.interrupted.abandoned`);

      expect(
        await withStateLock(home, async () => "recovered", {
          now: () => created + 30001,
          wait: async () => {},
          delays: [],
        }),
      ).toBe("recovered");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
