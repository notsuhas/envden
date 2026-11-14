import { loadState, saveState } from "../../state/store/repository.ts";
import { expect, test } from "bun:test";
import { cp } from "node:fs/promises";
import { join } from "node:path";

import type { TFetch } from "../../client/fetch.ts";

import { atomicWrite } from "../../state/store/files.ts";

import { push, pull } from "../engine.ts";

import { syncFixture } from "./flows.ts";

test("sync rollback", async () => {
  const fixture = await syncFixture();
  const { first, aStore, root, opts } = fixture;

  try {
    // Restore an older database through a second in-process server.
    const snapshot = join(root, "snapshot");
    await cp(join(root, "server"), snapshot, { recursive: true });
    await atomicWrite(aStore, "TOKEN=restored\n");
    await push(first, opts);
    const oldServer = await fixture.serve({ dataDir: snapshot, port: 0, now: opts.now });

    const stored = (await loadState(first.home))!;
    const original = stored.server!.address;
    stored.server!.address = oldServer.server.url.toString();
    await saveState(first.home, stored);

    try {
      const oldFetch: TFetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        url.host = oldServer.server.url.host;

        return fixture.fetcher(url, init);
      };

      await Promise.resolve(
        expect(pull(first, { ...opts, fetcher: oldFetch })).rejects.toMatchObject({
          code: "ROLLBACK",
        }),
      );
    } finally {
      stored.server!.address = original;
      await saveState(first.home, stored);
      await oldServer.server.stop(true);
      oldServer.storage.close();
      oldServer.stopPruning();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("interrupted placement preserves the accepted rollback floor and resumes", async () => {
  const { mkdir, readFile } = await import("node:fs/promises");
  const { loadState, saveState } = await import("../../state/store/repository.ts");
  const fixture = await syncFixture();
  const { first, second, aStore, root, opts, checkoutB } = fixture;

  try {
    const snapshot = join(root, "interrupted-snapshot");
    await cp(join(root, "server"), snapshot, { recursive: true });
    await atomicWrite(aStore, "TOKEN=new-version\n");
    await push(first, opts);
    const state = (await loadState(second.home))!;
    const extraRoot = join(root, "extra-checkout");
    await mkdir(extraRoot);
    state.approved.push({ ...checkoutB, root: extraRoot, gitDir: join(extraRoot, ".git") });
    await saveState(second.home, state);
    const placement = second.placement;
    let placements = 0;

    second.placement = (mode, checkout) => {
      const adapter = placement(mode, checkout);

      return {
        ...adapter,
        place: async (...args) => {
          if (++placements === 2) throw new Error("interrupted placement");
          await adapter.place(...args);
        },
      };
    };

    await Promise.resolve(expect(pull(second, opts)).rejects.toThrow("interrupted placement"));
    expect(await readFile(join(checkoutB.root, ".env"), "utf8")).toBe("TOKEN=new-version\n");
    second.placement = placement;
    const oldServer = await fixture.serve({ dataDir: snapshot, port: 0, now: opts.now });

    const stored = (await loadState(second.home))!;
    const original = stored.server!.address;
    stored.server!.address = oldServer.server.url.toString();
    await saveState(second.home, stored);

    try {
      const oldFetch: TFetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        url.host = oldServer.server.url.host;

        return fixture.fetcher(url, init);
      };

      await Promise.resolve(
        expect(pull(second, { ...opts, fetcher: oldFetch })).rejects.toMatchObject({
          code: "ROLLBACK",
        }),
      );

      expect(await readFile(join(checkoutB.root, ".env"), "utf8")).toBe("TOKEN=new-version\n");
    } finally {
      stored.server!.address = original;
      await saveState(second.home, stored);
      await oldServer.server.stop(true);
      oldServer.storage.close();
      oldServer.stopPruning();
    }

    await pull(second, opts);
    expect(await readFile(join(extraRoot, ".env"), "utf8")).toBe("TOKEN=new-version\n");
  } finally {
    await fixture.cleanup();
  }
});
