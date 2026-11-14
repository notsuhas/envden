import { expect, test } from "bun:test";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { removeFile } from "../remove.ts";
import { untrack } from "../../links/checkout/untrack.ts";
import { readDeletion } from "../local/reconciliation/operation/deletion.ts";
import { push, pull } from "../engine.ts";

const fixture = createSharedFixture();

test("untracking one copy preserves the other checkout's removal", async () => {
  const f = await fixture();
  const targets = await approveLayout(f, ["copy", "copy"]);
  await removeFile(f.second, join(targets[0]!.root, ".env"), { yes: true, now: f.now });
  expect(await untrack(f.second, targets[1]!.root)).toEqual([]);

  expect((await readDeletion(f.second.home, targets[0]!.store))?.targets).toEqual([
    join(targets[0]!.root, ".env"),
  ]);

  expect((await push(f.second, f.opts)).changed).toBe(1);
  await pull(f.first, f.opts);
  expect(await Bun.file(f.aStore).exists()).toBe(false);
});

test("untracking a dangling store link removes the owned link", async () => {
  const { rm, lstat } = await import("node:fs/promises");
  const f = await fixture();
  const targets = await approveLayout(f, ["copy", "link"]);
  await rm(targets[1]!.store);
  expect(await untrack(f.second, targets[1]!.root)).toEqual([]);
  expect(await lstat(join(targets[1]!.root, ".env")).catch(() => undefined)).toBeUndefined();
});
