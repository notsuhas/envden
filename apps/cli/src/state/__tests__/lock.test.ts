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
