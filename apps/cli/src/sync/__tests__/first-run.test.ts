import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createFakeRepoAdapter } from "@envden/testing/repo";

import { loadState, saveState } from "../../state/store/repository.ts";
import { atomicWrite } from "../../state/store/files.ts";

import { linkFile } from "../../links/file.ts";
import { firstRun } from "../first-run.ts";

import { syncFixture } from "./flows.ts";

test("sync first-run", async () => {
  const fixture = await syncFixture();
  const { third, checkout, root, opts } = fixture;

  try {
    const checkoutC = {
      ...checkout,
      root: join(root, "checkout-c"),
      gitDir: join(root, "checkout-c", ".git"),
    };

    third.repo = createFakeRepoAdapter({
      checkoutAt: async () => checkoutC,
      ensureIgnored: async () => {},
    });

    const cState = (await loadState(third.home))!;
    cState.approved.push(checkoutC);
    await saveState(third.home, cState);
    await atomicWrite(join(checkoutC.root, ".env"), "TOKEN=third-local\n");
    let choices = 0;

    await firstRun(third, {
      ...opts,
      choose: async () => {
        choices++;

        return "take-server";
      },
    });

    expect(choices).toBe(1);
    expect(await readFile(join(checkoutC.root, ".env"), "utf8")).toBe("TOKEN=local-test-value\n");
    const cStore = (await loadState(third.home))!.links[0]!.store;

    for (const choice of ["keep-mine", "merge"] as const) {
      await atomicWrite(cStore, "TOKEN=third-local\n");
      await firstRun(third, { ...opts, choose: async () => choice });
      expect(await readFile(cStore, "utf8")).toBe("TOKEN=third-local\n");
    }
  } finally {
    await fixture.cleanup();
  }
});

test("tracking after join does not invent an agreed server base", async () => {
  const f = await syncFixture();

  try {
    const state = (await loadState(f.second.home))!;
    await atomicWrite(join(f.checkoutB.root, ".env"), "TOKEN=mine\n");

    await linkFile(
      f.second,
      state,
      f.checkoutB,
      f.second.placement("link", f.checkoutB.root),
      ".env",
    );

    await saveState(f.second.home, state);
    const { pull } = await import("../engine.ts");
    expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  } finally {
    await f.cleanup();
  }
});
