import { expect, test } from "bun:test";
import { join } from "node:path";
import { atomicWrite } from "../../state/store/files.ts";
import { readAttempts, invalidAttemptState } from "../remote/attempt/state.ts";
import { createSharedFixture } from "./shared-fixture.ts";
import { loadState } from "../../state/store/repository.ts";

const fixture = createSharedFixture();

test("attempt scans ignore incomplete atomic writes and unrelated names", async () => {
  const f = await fixture();
  const state = (await loadState(f.first.home))!;

  for (const name of [".00000000-0000-0000-0000-000000000000.tmp", "stray", "receipt.invalid"])
    await atomicWrite(join(f.first.home, "state", "attempts", name), '{"header":');

  expect(await invalidAttemptState(f.first.home)).toBe(false);
  expect(await readAttempts(f.first, state.links)).toEqual([]);
  const { basePath } = await import("../local/files.ts");
  expect(await Bun.file(basePath(f.first.home, f.aStore) + ".corrupt").exists()).toBe(false);
});
