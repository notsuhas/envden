import { expect, test } from "bun:test";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWrite } from "../../state/store/files.ts";
import { pruneBackups } from "../local/retention.ts";

test("expired state backups and interrupted writes are removed without losing live records", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-retention-"));
  const now = 1800000000000;

  const expired = [
    "state/attempts/receipt.corrupt-uuid",
    "state/nested/record.corrupt-uuid",
    "state/.uuid.tmp",
    "base/file.pending.corrupt-uuid",
  ];

  const recent = ["state/live.json", "state/attempts/recent.corrupt-uuid", "base/file.pending"];

  try {
    for (const path of [...expired, ...recent]) await atomicWrite(join(home, path), "secret");

    for (const path of expired) {
      const old = new Date(now - 31 * 86400000);
      await utimes(join(home, path), old, old);
    }

    for (const path of recent) await utimes(join(home, path), new Date(now), new Date(now));

    await pruneBackups(home, now);

    for (const path of expired) expect(await Bun.file(join(home, path)).exists()).toBe(false);
    for (const path of recent) expect(await Bun.file(join(home, path)).exists()).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
