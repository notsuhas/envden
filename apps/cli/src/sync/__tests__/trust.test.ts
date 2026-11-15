import { expect, test } from "bun:test";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { createSharedFixture } from "./shared-fixture.ts";
import { pull, push } from "../engine.ts";
import { readBytes, writeBytes } from "../local/files.ts";
import { loadState } from "../../state/store/repository.ts";
import { setConfig } from "../../settings/config.ts";
import { seedScenario, finishScenario } from "./trust-fixture.ts";

const fixtureClock = () => 1800000000000;

const syncFixture = createSharedFixture();

const bytes = (value: string) => new TextEncoder().encode(value);
const original = bytes("TOKEN=local-test-value\n");

for (const scenario of [
  "historical",
  "untracked-copy",
  "untracked-link",
  "untracked-copy-no-yes",
  "untracked-link-no-yes",
  "missing-base",
  "different-base",
  "untracked-applied",
  "missing-copy",
  "local-sides",
  "removed",
  "prune-root",
  "untrack-root",
  "unapproved-deletion",
  "unapproved",
  "retry",
  "deletion-side",
  "edit-content",
  "changed-after-conflict",
  "merge-retry",
] as const)
  test(`target trust: ${scenario}`, async () => {
    const f = await syncFixture();

    try {
      const link = scenario === "historical" || scenario.startsWith("untracked-link");

      await setConfig(
        "placement",
        JSON.stringify({ [f.checkoutB.root]: link ? "link" : "copy" }),
        f.second.home,
      );

      await pull(f.second, f.opts);
      const state = (await loadState(f.second.home))!;
      const target = state.links[0]!;
      expect(target.mode).toBe(link ? "link" : "copy");
      const path = join(target.root, target.path);
      const edited = bytes(`TOKEN=${scenario}\n`);

      if (scenario === "historical") {
        await writeBytes(f.aStore, edited, fixtureClock);
        await push(f.first, f.opts);
        await pull(f.second, f.opts);
        await rm(path);
        await writeBytes(path, original, fixtureClock);
        expect((await pull(f.second, f.opts)).conflicts).toBe(0);
        expect(await readBytes(target.store)).toEqual(original);
        expect(await Bun.file(path).bytes()).toEqual(original);

        return;
      }

      const done = await seedScenario(scenario, f, state, target, path, edited);
      if (done) return;

      if (scenario === "merge-retry") {
        const placement = f.second.placement;
        let fail = true;

        f.second.placement = (mode, root) => ({
          ...placement(mode, root),
          place: async (store, destination) => {
            if (fail) {
              fail = false;
              throw new Error("injected placement failure");
            }

            await placement(mode, root).place(store, destination);
          },
        });

        await pull(f.second, f.opts).catch(() => {});
        expect((await pull(f.second, f.opts)).conflicts).toBe(0);
        expect(await readBytes(path)).toEqual(bytes("TOKEN=local-test-value\nA=local\nB=remote\n"));

        return;
      }

      await finishScenario(scenario, f, state, target, path, edited);
    } finally {
      await f.cleanup();
    }
  });
