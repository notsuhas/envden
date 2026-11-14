import { expect, test } from "bun:test";
import { basename, join } from "node:path";
import { readdir, utimes } from "node:fs/promises";
import { EnvdenError } from "@envden/core/errors";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { basePath } from "../local/files.ts";
import { heldBackFiles } from "../local/lineage/held-back.ts";
import { pull, push } from "../engine.ts";
import { resolveConflict } from "../resolve.ts";
import { removeFile } from "../remove.ts";
import { untrack } from "../../links/checkout/untrack.ts";
import { deletionRequested } from "../local/reconciliation/operation/deletion.ts";

const fixture = createSharedFixture();

for (const suffix of [".entry", ".pending", ".delete", "attempt"])
  test(`corrupt ${suffix} is quarantined and resolvable`, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, ["copy"]);
    const store = targets[0]!.store;

    const path =
      suffix === "attempt"
        ? join(f.second.home, "state", "attempts", "A".repeat(43))
        : basePath(f.second.home, store) + suffix;

    await atomicWrite(path, "{invalid");
    await utimes(path, new Date(0), new Date(0));
    await atomicWrite(join(targets[0]!.root, ".env"), "TOKEN=mine\n");
    const result = await push(f.second, f.opts);
    expect(result.conflicts).toBe(1);
    expect(result.changed).toBe(0);
    expect((await heldBackFiles(f.second)).length).toBeGreaterThan(0);

    expect(
      (await readdir(join(path, ".."))).some((name) =>
        name.startsWith(basename(path) + ".corrupt-"),
      ),
    ).toBe(true);

    await resolveConflict(f.second, { file: ".env", choice: "keep-mine", now: f.now });
    expect((await push(f.second, f.opts)).conflicts).toBe(0);
  });

test("invalid applied state is a named EnvdenError", async () => {
  const f = await fixture();
  await approveLayout(f, ["copy"]);
  const path = join(f.second.home, "state", "applied-files.json");
  await atomicWrite(path, "{invalid");

  try {
    await pull(f.second, f.opts);
    throw new Error("Expected invalid state");
  } catch (error) {
    expect(error).toBeInstanceOf(EnvdenError);
    expect(error instanceof Error && error.message).toContain(path);
  }
});

test("untrack cancels removal and tolerates a corrupt pending record", async () => {
  const f = await fixture();
  const targets = await approveLayout(f, ["copy"]);
  const target = targets[0]!;
  await removeFile(f.second, join(target.root, ".env"), { yes: true, now: f.now });
  await atomicWrite(basePath(f.second.home, target.store) + ".pending", "{invalid");
  expect(await untrack(f.second, target.root)).toEqual([join(target.root, ".env")]);
  expect(await deletionRequested(f.second.home, target.store)).toBe(false);
});

test("untracking one target preserves a shared corrupt-state hold", async () => {
  const f = await fixture();
  const targets = await approveLayout(f, ["copy", "copy"]);
  await atomicWrite(targets[0]!.store, "TOKEN=unknown\n");
  await atomicWrite(basePath(f.second.home, targets[0]!.store) + ".pending", "{invalid");
  await untrack(f.second, targets[1]!.root);
  const result = await push(f.second, f.opts);
  expect(result.conflicts).toBe(1);
  expect(result.changed).toBe(0);
});
