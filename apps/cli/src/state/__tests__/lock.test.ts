import { fileURLToPath } from "node:url";
import { spawnTrusted } from "@envden/core/process";
import * as lockOwners from "../lock/owner.ts";
import { test, expect, spyOn } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withStateLock } from "../lock/lock.ts";

test("owned lock rejects concurrent writers, nests and reclaims a dead owner", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-lock-"));
  const path = join(home, "state", "write.lock");
  let release = () => {};
  let entered = () => {};

  const ready = new Promise<void>((done) => {
    entered = done;
  });

  const gate = new Promise<void>((done) => {
    release = done;
  });

  try {
    const running = withStateLock(home, async () => {
      await withStateLock(home, async () => {
        const owner = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
        expect(owner.pid).toBe(process.pid);
        expect(typeof owner.startedAt).toBe("string");
      });

      entered();
      await gate;
    });

    await ready;

    await Promise.resolve(
      expect(
        withStateLock(home, async () => {}, {
          now: () => 0,
          wait: async () => {
            throw new Error("Unexpected wait without a retry delay");
          },
          delays: [],
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" }),
    );

    release();
    await running;
    await mkdir(path);
    await writeFile(join(path, "owner.json"), JSON.stringify({ pid: 2147483647, token: "dead" }));
    expect(await withStateLock(home, async () => "reclaimed")).toBe("reclaimed");

    await Promise.resolve(
      expect(
        withStateLock(home, async () => {
          throw new Error("failure");
        }),
      ).rejects.toThrow("failure"),
    );
  } finally {
    release();
    await rm(home, { recursive: true, force: true });
  }
});

test("a reused PID does not preserve a dead owner's lock", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-pid-"));

  try {
    const path = join(home, "state", "write.lock");
    await mkdir(path, { recursive: true });

    await writeFile(
      join(path, "owner.json"),
      JSON.stringify({ pid: process.pid, startedAt: "old process", token: "old" }),
    );

    expect(await withStateLock(home, async () => "reclaimed")).toBe("reclaimed");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("lock directories and owner files cannot be symlinks", async () => {
  const { symlink } = await import("node:fs/promises");
  const home = await mkdtemp(join(tmpdir(), "envden-lock-link-"));

  try {
    const path = join(home, "state", "write.lock");
    await mkdir(join(home, "state"));
    await mkdir(join(home, "outside"));
    await symlink(join(home, "outside"), path);
    const created = (await lstat(path)).mtimeMs;

    await writeFile(
      join(home, "outside", "owner.json"),
      JSON.stringify({ pid: 2147483647, token: "dead" }),
    );

    expect(await lockOwners.owner(path)).toBeUndefined();
    await rm(join(home, "outside", "owner.json"));
    expect(await lockOwners.expiredOwner(path, undefined, created + 30001)).toBe(false);
    const readOwner = spyOn(lockOwners, "owner");

    try {
      await Promise.resolve(
        expect(
          withStateLock(home, async () => {}, {
            now: () => created + 30001,
            wait: async () => {},
            delays: [],
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" }),
      );

      expect(readOwner).not.toHaveBeenCalled();
    } finally {
      readOwner.mockRestore();
    }

    await rm(path);
    await mkdir(path);
    await writeFile(join(home, "owner"), JSON.stringify({ pid: 2147483647, token: "dead" }));
    await symlink(join(home, "owner"), join(path, "owner.json"));
    expect(await lockOwners.owner(path)).toBeUndefined();

    await Promise.resolve(
      expect(
        withStateLock(home, async () => {}, {
          now: () => created + 30001,
          wait: async () => {},
          delays: [],
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" }),
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("sync reclaims the state lock of a killed process", async () => {
  const { withSyncLock } = await import("../../sync/local/files.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-killed-sync-"));

  const child = spawnTrusted(
    [
      "bun",
      "--eval",
      `import { withSyncLock } from ${JSON.stringify(fileURLToPath(new URL("../../sync/local/files.ts", import.meta.url)))}; await withSyncLock(${JSON.stringify(home)}, async () => { console.log('locked'); await new Promise(() => {}); });`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  try {
    const reader = child.stdout.getReader();
    await reader.read();
    child.kill("SIGKILL");
    await child.exited;
    expect(await withSyncLock(home, async () => "resumed")).toBe("resumed");
  } finally {
    child.kill();
    await rm(home, { recursive: true, force: true });
  }
});

test("a writer retries contention and enters after the owner releases", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-retry-"));
  const path = join(home, "state", "write.lock");
  let waits = 0;

  try {
    await mkdir(path, { recursive: true });
    const { processStart } = await import("../lock/process.ts");
    const observed = await processStart(process.pid);
    if (observed.kind !== "live") throw new Error("Missing process start");

    await writeFile(
      join(path, "owner.json"),
      JSON.stringify({ pid: process.pid, startedAt: observed.startedAt, token: "other" }),
    );

    expect(
      await withStateLock(home, async () => "entered", {
        now: () => 0,
        delays: [50],
        wait: async () => {
          waits++;
          await rm(path, { recursive: true });
        },
      }),
    ).toBe("entered");

    expect(waits).toBe(1);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("ownerless initialization recovers only after its grace period", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-orphan-"));
  const path = join(home, "state", "write.lock");
  const { lstat } = await import("node:fs/promises");

  try {
    await mkdir(path, { recursive: true });
    const created = (await lstat(path)).mtimeMs;
    const clock = { now: () => created, wait: async () => {}, delays: [] };

    await Promise.resolve(
      expect(withStateLock(home, async () => {}, clock)).rejects.toMatchObject({
        code: "CONFLICT",
      }),
    );

    expect(
      await withStateLock(home, async () => "recovered", { ...clock, now: () => created + 30001 }),
    ).toBe("recovered");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("owner publication exposes complete metadata and never overwrites an owner", async () => {
  const { publishOwner } = await import("../lock/publish.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-publication-"));
  const first = { pid: process.pid, token: "first", startedAt: "start" };

  try {
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

for (const crash of ["guard", "renamed"])
  test(`reclaim recovers after a crash at ${crash}`, async () => {
    const { lstat, rename } = await import("node:fs/promises");
    const home = await mkdtemp(join(tmpdir(), "envden-reclaim-"));
    const path = join(home, "state", "write.lock");

    try {
      await mkdir(join(path, "reclaim"), { recursive: true });
      await writeFile(join(path, "owner.json"), JSON.stringify({ pid: 2147483647, token: "dead" }));
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

test("importing the lock does not probe process start", async () => {
  const path = fileURLToPath(new URL("../lock/lock.ts", import.meta.url));

  const child = spawnTrusted(
    [
      process.execPath,
      "--eval",
      `
    import { spyOn } from 'bun:test';
    import * as processes from ${JSON.stringify(import.meta.resolve("@envden/core/process"))};
    const probe = spyOn(processes, 'execTrusted');
    await import(${JSON.stringify(path)});
    if (probe.mock.calls.length) throw new Error('Import probed processes');
  `,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  expect(await new Response(child.stderr).text()).toBe("");
  expect(await child.exited).toBe(0);
});
