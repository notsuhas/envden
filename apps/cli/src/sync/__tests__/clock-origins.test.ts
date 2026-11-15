import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { basePath } from "../local/files.ts";
import { untrack } from "../../links/checkout/untrack.ts";
import { pull } from "../engine.ts";

const fixture = createSharedFixture();

test("untrack quarantine survives pruning with the same command clock", async () => {
  const f = await fixture();
  const targets = await approveLayout(f, ["copy", "copy"]);
  await atomicWrite(basePath(f.second.home, targets[0]!.store) + ".delete", "garbage", f.now);
  await untrack(f.second, targets[1]!.root);
  const directory = join(f.second.home, "base");
  const before = (await readdir(directory)).filter((name) => name.includes(".corrupt-"));
  expect(before).toHaveLength(1);
  await pull(f.second, f.opts);
  expect((await readdir(directory)).filter((name) => name.includes(".corrupt-"))).toEqual(before);
});
