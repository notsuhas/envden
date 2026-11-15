import { expect, test } from "bun:test";
import { mkdtemp, rm, utimes, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWrite } from "../../state/store/files.ts";
import { pruneBackups } from "../local/retention.ts";

const fixtureClock = () => 1800000000000;

test("expired state backups and interrupted writes are removed without losing live records", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-retention-"));
  const now = 1800000000000;

  const expiredAt = now - 31 * 86400000;

  const expired = [
    `state/attempts/receipt.corrupt-${expiredAt}_12345678-abcd-4000-8000-000000000000`,
    `state/record.corrupt-${expiredAt}_12345678-abcd-4000-8000-000000000000`,
    `state/attempts/record.corrupt-${expiredAt}_12345678-abcd-4000-8000-000000000000`,
    `state/.${expiredAt}_12345678-abcd-4000-8000-000000000000.tmp`,
    `state/blobs/.${expiredAt}_12345678-abcd-4000-8000-000000000000.tmp`,
    `state/file-lists/.${expiredAt}_12345678-abcd-4000-8000-000000000000.tmp`,
    `base/file.pending.corrupt-${expiredAt}_12345678-abcd-4000-8000-000000000000`,
  ];

  const recent = [
    `state/live.json`,
    `state/attempts/recent.corrupt-${now}_12345678-abcd-4000-8000-000000000000`,
    `base/file.pending`,
  ];

  try {
    for (const path of [...expired, ...recent]) {
      const destination =
        path === `state/record.corrupt-${expiredAt}_12345678-abcd-4000-8000-000000000000`
          ? join(path, "secret")
          : path;

      await atomicWrite(join(home, destination), "secret", () => now);
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

test("retention leaves update state and lock directories to their owners", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-retention-"));
  const paths = ["state/update/state/write.lock/.0-abcd.tmp", "base/write.lock/.0-abcd.tmp"];

  try {
    for (const path of paths) await atomicWrite(join(home, path), "owner", fixtureClock);
    await pruneBackups(home, 1800000000000);
    for (const path of paths) expect(await Bun.file(join(home, path)).exists()).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a UUID prefix cannot impersonate a retention timestamp", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-retention-"));
  const name = "base/file.corrupt-12345678-abcd-4000-8000-000000000000";

  try {
    await atomicWrite(join(home, name), "saved", fixtureClock);
    await pruneBackups(home, 1800000000000);
    expect(await Bun.file(join(home, name)).exists()).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
