import { processIdentity } from "../lock/process.ts";
import { withStateLock } from "../lock/lock.ts";
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rename, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reclaimLock } from "../lock/reclaim.ts";
import { owner } from "../lock/owner.ts";

test("a suspended reclaimer preserves the replacement owner", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-race-"));
  const path = join(home, "lock");

  try {
    await mkdir(path);

    await writeFile(
      join(path, "owner.json"),
      JSON.stringify({ pid: 123, token: "old", startedAt: "start", createdAt: 0 }),
    );

    expect(
      await reclaimLock(path, "old", 100, async () => {
        await rename(path, join(home, "old"));
        await mkdir(path);

        await writeFile(
          join(path, "owner.json"),
          JSON.stringify({ pid: 124, token: "new", startedAt: "start", createdAt: 0 }),
        );
      }),
    ).toBe(false);

    expect(JSON.parse(await readFile(join(path, "owner.json"), "utf8")).token).toBe("new");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
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
        JSON.stringify({
          pid: 2147483647,
          token: "dead",
          startedAt: "start",
          createdAt: 0,
          identity: await processIdentity(),
        }),
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

test("owner publication exposes complete metadata and never overwrites an owner", async () => {
  const { publishOwner } = await import("../lock/publish.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-publication-"));
  const first = { pid: process.pid, token: "first", createdAt: 0, startedAt: "start" };

  try {
    for (const incomplete of [
      { ...first, startedAt: undefined },
      { ...first, createdAt: undefined },
    ]) {
      await writeFile(join(home, "owner.json"), JSON.stringify(incomplete));
      expect(await owner(home)).toBeUndefined();
    }

    await rm(join(home, "owner.json"));
    await publishOwner(home, first);
    expect(JSON.parse(await readFile(join(home, "owner.json"), "utf8"))).toEqual(first);

    await Promise.resolve(
      expect(publishOwner(home, { ...first, token: "second" })).rejects.toMatchObject({
        code: "EEXIST",
      }),
    );

    expect(JSON.parse(await readFile(join(home, "owner.json"), "utf8"))).toEqual(first);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
