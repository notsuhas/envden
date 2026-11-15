import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { updateStatus, recordUpdateRequired } from "../status.ts";
import { saveUpdateCache } from "../cache.ts";
import { atomicWrite } from "../../state/store/files.ts";

const fixtureClock = () => 1800000000000;

test("status reports lookup failure and server refusal until the binary changes", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-status-"));

  try {
    await saveUpdateCache(
      home,
      {
        latest: "99.0.0",
        checkedAt: 1,
        message: "Cannot confirm envden is up to date",
      },
      fixtureClock,
    );

    await recordUpdateRequired(home, undefined, fixtureClock);

    expect(await updateStatus(home)).toEqual({
      available: true,
      required: true,
      message: "Cannot confirm envden is up to date",
    });

    await atomicWrite(join(home, "state", "update-required"), "previous-version", fixtureClock);

    expect((await updateStatus(home)).required).toBe(false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
