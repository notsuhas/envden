import { expect, test } from "bun:test";
import { lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { markLocalOnly } from "../../links/local-only.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";
import { pull, push } from "../engine.ts";
import { resolveConflict } from "../resolve.ts";
import { conflictRecords } from "../local/conflicts.ts";

const fixtureClock = () => 1800000000000;

const fixture = createSharedFixture();

for (const side of ["mine", "server"] as const)
  test(`missing recorded ${side} bytes cannot become a deletion choice`, async () => {
    const f = await fixture();
    await pull(f.second, f.opts);
    const store = (await loadState(f.second.home))!.links[0]!.store;
    await atomicWrite(store, "TOKEN=mine\n", fixtureClock);
    await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
    await push(f.first, f.opts);
    expect((await pull(f.second, f.opts)).conflicts).toBe(1);
    const record = (await conflictRecords(f.second.home))[0]!;
    await rm(record[side]);

    await Promise.resolve(
      expect(
        resolveConflict(f.second, {
          file: ".env",
          choice: side === "mine" ? "keep-mine" : "take-server",
          now: f.now,
        }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );

    expect(await Bun.file(store).text()).toBe("TOKEN=mine\n");
    expect(await conflictRecords(f.second.home)).toHaveLength(1);
  });

test("resolve leaves a target marked local only after the conflict", async () => {
  const f = await fixture(["link", "link"]);
  const { targets } = f;
  const store = targets[0]!.store;
  const kept = join(targets[1]!.root, ".env");
  await atomicWrite(store, "TOKEN=mine\n", fixtureClock);
  await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
  await push(f.first, f.opts);
  expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  await markLocalOnly(f.second, (await loadState(f.second.home))!, targets[1]!.root, ".env");
  await resolveConflict(f.second, { file: ".env", choice: "take-server", now: f.now });

  expect((await lstat(kept)).isSymbolicLink()).toBe(false);
  expect(await Bun.file(kept).text()).toBe("TOKEN=mine\n");
  expect(await Bun.file(join(targets[0]!.root, ".env")).text()).toBe("TOKEN=remote\n");
});
