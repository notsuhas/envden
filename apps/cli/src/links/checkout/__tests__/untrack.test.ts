import { test, expect } from "bun:test";
import { lstat, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { emptyState } from "../../../state/model.ts";
import { saveState } from "../../../state/store/repository.ts";
import { linkCheckout } from "../../place.ts";
import { offerTakeover } from "../../takeover/offer.ts";
import { clock, fixture } from "../../takeover/__tests__/fixture.ts";
import { untrack } from "../untrack.ts";

async function takenOver(f: Awaited<ReturnType<typeof fixture>>, target: string) {
  const state = emptyState("test");
  const checkout = await f.checkout("app", "host/app", target);
  const links = await linkCheckout(f.adapters, state, checkout, async () => true);
  await offerTakeover(f.adapters, state, links, false, async () => true);
  await saveState(f.adapters.home, state, clock);

  return join(checkout.root, ".env");
}

test("untracking a taken-over env file restores the user's own link", async () => {
  const f = await fixture();

  try {
    const target = join(f.root, "shared.env");
    await writeFile(target, "A=1\n");
    const env = await takenOver(f, target);
    expect(await readlink(env)).not.toBe(target);

    await untrack(f.adapters, join(f.root, "app"));

    expect(await readlink(env)).toBe(target);
    expect(await readFile(env, "utf8")).toBe("A=1\n");
  } finally {
    await f.close();
  }
});

test("untracking a taken-over env file whose original is gone keeps the synced copy", async () => {
  const f = await fixture();

  try {
    const target = join(f.root, "shared.env");
    await writeFile(target, "A=1\n");
    const env = await takenOver(f, target);
    await rm(target);

    await untrack(f.adapters, join(f.root, "app"));

    expect((await lstat(env)).isFile()).toBe(true);
    expect(await readFile(env, "utf8")).toBe("A=1\n");
  } finally {
    await f.close();
  }
});
