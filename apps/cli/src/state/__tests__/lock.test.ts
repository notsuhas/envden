import { test, expect } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withStateLock } from "../lock.ts";

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
    await Promise.resolve(expect(withStateLock(home, async () => {})).rejects.toThrow(path));
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
    await Promise.resolve(expect(withStateLock(home, async () => {})).rejects.toThrow());
    await rm(path);
    await mkdir(path);
    await writeFile(join(home, "owner"), JSON.stringify({ pid: 2147483647, token: "dead" }));
    await symlink(join(home, "owner"), join(path, "owner.json"));
    await Promise.resolve(expect(withStateLock(home, async () => {})).rejects.toThrow());
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("sync reclaims the state lock of a killed process", async () => {
  const { withSyncLock } = await import("../../sync/local/files.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-killed-sync-"));

  const child = Bun.spawn(
    [
      "bun",
      "--eval",
      `import { withSyncLock } from ${JSON.stringify(new URL("../../sync/local/files.ts", import.meta.url).pathname)}; await withSyncLock(${JSON.stringify(home)}, async () => { console.log('locked'); await new Promise(() => {}); });`,
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
