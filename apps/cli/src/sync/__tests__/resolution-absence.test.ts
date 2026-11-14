import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { createSharedFixture } from "./shared-fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";
import { pull, push } from "../engine.ts";
import { resolveConflict } from "../resolve.ts";
import { conflictRecords } from "../local/conflicts.ts";

const fixture = createSharedFixture();

for (const side of ["mine", "server"] as const)
  test(`missing recorded ${side} bytes cannot become a deletion choice`, async () => {
    const f = await fixture();
    await pull(f.second, f.opts);
    const store = (await loadState(f.second.home))!.links[0]!.store;
    await atomicWrite(store, "TOKEN=mine\n");
    await atomicWrite(f.aStore, "TOKEN=remote\n");
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
