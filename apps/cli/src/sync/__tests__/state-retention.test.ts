import { expect, test } from "bun:test";
import { mkdtemp, rm, utimes, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWrite } from "../../state/store/files.ts";
import { pruneBackups } from "../local/retention.ts";

test("expired state backups and interrupted writes are removed without losing live records", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-retention-"));
  const now = 1800000000000;

  const expiredAt = now - 31 * 86400000;

  const expired = [
    `state/attempts/receipt.corrupt-${expiredAt}-abcd`,
    `state/record.corrupt-${expiredAt}-abcd`,
    `state/attempts/record.corrupt-${expiredAt}-abcd`,
    `state/.${expiredAt}-abcd.tmp`,
    `base/file.pending.corrupt-${expiredAt}-abcd`,
  ];

  const recent = [
    `state/live.json`,
    `state/attempts/recent.corrupt-${now}-abcd`,
    `base/file.pending`,
  ];

  try {
    for (const path of [...expired, ...recent]) {
      const destination =
        path === `state/record.corrupt-${expiredAt}-abcd` ? join(path, "secret") : path;

      await atomicWrite(join(home, destination), "secret");
    }

    for (const path of expired) {
      const old = new Date(now);
      await utimes(join(home, path), old, old);
    }

    for (const path of recent) await utimes(join(home, path), new Date(0), new Date(0));

    await pruneBackups(home, now);

    for (const path of expired)
      expect(await lstat(join(home, path)).catch(() => undefined)).toBeUndefined();

    for (const path of recent) expect(await Bun.file(join(home, path)).exists()).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
