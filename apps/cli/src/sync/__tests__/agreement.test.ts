import { rm } from "node:fs/promises";
import { removeFile } from "../remove.ts";
import { expect, test } from "bun:test";
import { join } from "node:path";

const fixtureClock = () => 1800000000000;

import { createSharedFixture } from "./shared-fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { linkCheckout } from "../../links/place.ts";
import { pull, push } from "../engine.ts";
import { resolveConflict } from "../resolve.ts";
import { readBytes, writeBytes, basePath } from "../local/files.ts";

const syncFixture = createSharedFixture();

for (const [base, stored, copied, agreed] of [
  [true, "1", "1", "1"],
  [true, "store", "1", "store"],
  [true, "1", "copy", "copy"],
  [true, "store", "copy", undefined],
  [true, undefined, "1", undefined],
  [true, "same", "same", "same"],
  [false, "1", "1", "1"],
  [false, "store", "1", undefined],
  [false, "1", "copy", undefined],
  [false, "store", "copy", undefined],
  [false, "same", "same", "same"],
] as const)
  test(`unpublished copy agreement: base=${base}, store=${stored}, copy=${copied}`, async () => {
    const f = await syncFixture();

    try {
      const state = (await loadState(f.first.home))!;
      const copy = { ...f.checkout, root: join(f.root, "copy") };
      f.first.repo.envFiles = async () => [".env.new"];
      await atomicWrite(join(f.checkout.root, ".env.new"), "PORT=1\n", fixtureClock);
      await linkCheckout(f.first, state, f.checkout, async () => true);
      await atomicWrite(join(copy.root, ".env.new"), "PORT=1\n", fixtureClock);
      await linkCheckout(f.first, state, copy, async () => true, true);
      await saveState(f.first.home, state, fixtureClock);
      const store = state.links.find((link) => link.path === ".env.new")!.store;
      if (!base) await rm(basePath(f.first.home, store, copy.root));
      await writeBytes(store, portContent(stored), fixtureClock);
      await atomicWrite(join(copy.root, ".env.new"), `PORT=${copied}\n`, fixtureClock);
      const result = await pull(f.first, f.opts);

      if (base && stored === undefined) {
        expect(result.conflicts).toBe(1);
        expect(await readBytes(store)).toBeUndefined();
        expect(await readBytes(join(copy.root, ".env.new"))).toEqual(portContent(copied));

        return;
      }

      expect(result.conflicts > 0).toBe(agreed === undefined);
      expect(await readBytes(store)).toEqual(portContent(agreed ?? stored));
      expect(await Bun.file(join(copy.root, ".env.new")).text()).toBe(`PORT=${agreed ?? copied}\n`);

      if (result.conflicts) {
        await resolveConflict(f.first, { file: ".env.new", choice: "keep-mine", now: f.now });
        await atomicWrite(join(copy.root, ".env.new"), "PORT=resolved\n", fixtureClock);
        expect((await push(f.first, f.opts)).kind).toBe("pushed");
        expect(await Bun.file(store).text()).toBe("PORT=resolved\n");
      }
    } finally {
      await f.cleanup();
    }
  });

for (const copy of [false, true])
  for (const choice of [
    "applied",
    "keep-mine",
    "take-server",
    "repair",
    "untracked-repair",
  ] as const)
    test(`tombstone re-add: copy=${copy}, choice=${choice}`, async () => {
      const f = await syncFixture();

      try {
        const adapters = choice === "applied" ? f.first : f.second;
        const checkout = choice === "applied" ? f.checkout : f.checkoutB;

        await configureUntrackedCopy(adapters.home, checkout.root, copy, choice);

        await removeFile(f.first, join(f.checkout.root, ".env"), { yes: true, now: f.now });
        await push(f.first, f.opts);
        await atomicWrite(join(checkout.root, ".env"), "TOKEN=recreated\n", fixtureClock);
        const state = (await loadState(adapters.home))!;
        adapters.repo.envFiles = async () => [".env"];

        if (choice !== "untracked-repair")
          await linkCheckout(adapters, state, checkout, async () => true, copy);

        await saveState(adapters.home, state, fixtureClock);

        if (choice === "repair" || choice === "untracked-repair") {
          const { savePendingRepairs } = await import("../remote/repairs.ts");
          const { syncContext } = await import("../remote/context.ts");
          const p = await import("@envden/core/protocol");
          const context = await syncContext(adapters, f.opts);

          await savePendingRepairs(
            adapters.home,
            new Set([p.base32(p.fileId(context.checkpoint.idKey, checkout.repoId, ".env"))]),
            fixtureClock,
          );
        }

        const result = await push(adapters, f.opts);

        if (choice === "applied") expect(result.kind).toBe("pushed");
        else {
          expect(result.kind).toBe("conflict");

          await resolveConflict(adapters, {
            file: ".env",
            choice: choice === "take-server" ? "take-server" : "keep-mine",
            now: f.now,
          });

          const next = await push(adapters, f.opts);
          expect(next.kind).not.toBe("conflict");

          if (choice !== "take-server") expect(next.kind).toBe("pushed");
          else expect(await Bun.file(join(checkout.root, ".env")).exists()).toBe(false);
        }
      } finally {
        await f.cleanup();
      }
    });

function portContent(value: string | undefined) {
  return value === undefined ? undefined : new TextEncoder().encode(`PORT=${value}\n`);
}

async function configureUntrackedCopy(home: string, root: string, copy: boolean, choice: string) {
  if (!copy || choice !== "untracked-repair") return;
  const { setConfig } = await import("../../settings/config.ts");
  await setConfig("placement", JSON.stringify({ [root]: "copy" }), home, () => 0);
}
