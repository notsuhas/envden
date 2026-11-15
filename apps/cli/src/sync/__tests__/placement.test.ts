import { expect, test } from "bun:test";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { setConfig } from "../../settings/config.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";
import { pull } from "../engine.ts";
import { syncFixture } from "./flows.ts";

const fixtureClock = () => 1800000000000;

test("sync honors copy preference and prunes adapter backups after placement", async () => {
  const fixture = await syncFixture();
  const { second, checkoutB, opts } = fixture;

  const expired = join(
    second.home,
    "conflicts",
    ".envden-backup-0-00000000-0000-0000-0000-000000000000",
  );

  try {
    await setConfig("placement", JSON.stringify({ [checkoutB.root]: "copy" }), second.home);
    await atomicWrite(expired, "old backup", fixtureClock);
    const prune = second.prunePlacementBackups;
    const calls: number[] = [];

    second.prunePlacementBackups = async (now) => {
      calls.push(now);
      await prune(now);
    };

    await pull(second, opts);
    expect(calls).toEqual([opts.now()]);
    expect((await loadState(second.home))!.links[0]!.mode).toBe("copy");
    expect((await lstat(join(checkoutB.root, ".env"))).isSymbolicLink()).toBe(false);
    expect(await Bun.file(expired).exists()).toBe(false);
  } finally {
    await fixture.cleanup();
  }
});
