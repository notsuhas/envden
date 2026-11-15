import { expect, test } from "bun:test";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { removeFile } from "../remove.ts";
import { untrack } from "../../links/checkout/untrack.ts";
import { readDeletion } from "../local/reconciliation/operation/deletion.ts";
import { push, pull } from "../engine.ts";

const fixtureClock = () => 1800000000000;

const fixture = createSharedFixture();

test("untracking one copy preserves the other checkout's removal", async () => {
  const f = await fixture(["copy", "copy"]);
  const { targets } = f;
  await removeFile(f.second, join(targets[0]!.root, ".env"), { yes: true, now: f.now });
  expect(await untrack(f.second, targets[1]!.root)).toEqual([]);

  expect((await readDeletion(f.second.home, targets[0]!.store, fixtureClock))?.targets).toEqual([
    join(targets[0]!.root, ".env"),
  ]);

  expect((await push(f.second, f.opts)).changed).toBe(1);
  await pull(f.first, f.opts);
  expect(await Bun.file(f.aStore).exists()).toBe(false);
});

test("untracking a dangling store link removes the owned link", async () => {
  const { rm, lstat } = await import("node:fs/promises");
  const f = await fixture(["copy", "link"]);
  const { targets } = f;
  await rm(targets[1]!.store);
  expect(await untrack(f.second, targets[1]!.root)).toEqual([]);
  expect(await lstat(join(targets[1]!.root, ".env")).catch(() => undefined)).toBeUndefined();
});

test("take-server preserves live server after removal skipped an edited checkout", async () => {
  const { loadState, saveState } = await import("../../state/store/repository.ts");
  const { atomicWrite } = await import("../../state/store/files.ts");
  const { resolveConflict } = await import("../resolve.ts");
  const f = await fixture(["copy", "copy"]);
  const { targets } = f;
  const state = (await loadState(f.second.home))!;
  const approved = state.approved;
  state.approved = approved.filter((item) => item.root !== targets[1]!.root);
  await saveState(f.second.home, state, fixtureClock);
  await removeFile(f.second, join(targets[0]!.root, ".env"), { yes: true, now: f.now });
  await atomicWrite(join(targets[1]!.root, ".env"), "TOKEN=edited-copy\n", fixtureClock);
  state.approved = approved;
  await saveState(f.second.home, state, fixtureClock);
  expect((await push(f.second, f.opts)).conflicts).toBe(1);
  await resolveConflict(f.second, { file: ".env", choice: "take-server", now: f.now });
  await push(f.second, f.opts);
  await pull(f.first, f.opts);
  expect(await Bun.file(f.aStore).text()).toBe("TOKEN=local-test-value\n");
});
