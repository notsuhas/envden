import { expect, test } from "bun:test";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { syncFixture } from "./flows.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { linkCheckout } from "../../links/place.ts";
import { pull, push } from "../engine.ts";
import { resolveConflict } from "../resolve.ts";
import { basePath } from "../local/files.ts";

for (const [base, stored, copied, agreed] of [
  [true, "1", "1", "1"],
  [true, "store", "1", "store"],
  [true, "1", "copy", "copy"],
  [true, "store", "copy", undefined],
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
      await atomicWrite(join(f.checkout.root, ".env.new"), "PORT=1\n");
      await linkCheckout(f.first, state, f.checkout, async () => true);
      await atomicWrite(join(copy.root, ".env.new"), "PORT=1\n");
      await linkCheckout(f.first, state, copy, async () => true, true);
      await saveState(f.first.home, state);
      const store = state.links.find((link) => link.path === ".env.new")!.store;
      if (!base) await rm(basePath(f.first.home, store, copy.root) + ".unpublished");
      await atomicWrite(store, `PORT=${stored}\n`);
      await atomicWrite(join(copy.root, ".env.new"), `PORT=${copied}\n`);
      const result = await pull(f.first, f.opts);
      expect(result.conflicts > 0).toBe(agreed === undefined);
      expect(await Bun.file(store).text()).toBe(`PORT=${agreed ?? stored}\n`);
      expect(await Bun.file(join(copy.root, ".env.new")).text()).toBe(`PORT=${agreed ?? copied}\n`);

      if (result.conflicts) {
        await resolveConflict(f.first, { file: ".env.new", choice: "keep-mine", now: f.now });
        await atomicWrite(join(copy.root, ".env.new"), "PORT=resolved\n");
        expect((await push(f.first, f.opts)).kind).toBe("pushed");
        expect(await Bun.file(store).text()).toBe("PORT=resolved\n");
      }
    } finally {
      await f.cleanup();
    }
  });

for (const copy of [false, true])
  for (const choice of ["applied", "keep-mine", "take-server", "repair"] as const)
    test(`tombstone re-add: copy=${copy}, choice=${choice}`, async () => {
      const f = await syncFixture();

      try {
        const adapters = choice === "applied" ? f.first : f.second;
        const checkout = choice === "applied" ? f.checkout : f.checkoutB;
        await rm(f.aStore);
        await push(f.first, f.opts);
        await atomicWrite(join(checkout.root, ".env"), "TOKEN=recreated\n");
        const state = (await loadState(adapters.home))!;
        adapters.repo.envFiles = async () => [".env"];
        await linkCheckout(adapters, state, checkout, async () => true, copy);
        await saveState(adapters.home, state);

        if (choice === "repair") {
          const { savePendingRepairs } = await import("../remote/repairs.ts");
          const { syncContext } = await import("../remote/context.ts");
          const p = await import("@envden/core/protocol");
          const context = await syncContext(adapters, f.opts);

          await savePendingRepairs(
            adapters.home,
            new Set([p.base32(p.fileId(context.checkpoint.idKey, checkout.repoId, ".env"))]),
          );
        }

        const result = await push(adapters, f.opts);

        if (choice === "applied") expect(result.kind).toBe("pushed");
        else {
          expect(result.kind).toBe("conflict");

          await resolveConflict(adapters, {
            file: ".env",
            choice: choice === "repair" ? "keep-mine" : choice,
            now: f.now,
          });

          const next = await push(adapters, f.opts);
          expect(next.kind).not.toBe("conflict");

          if (choice === "keep-mine" || choice === "repair") expect(next.kind).toBe("pushed");
          else expect(await Bun.file(join(checkout.root, ".env")).exists()).toBe(false);
        }
      } finally {
        await f.cleanup();
      }
    });
