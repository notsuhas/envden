import { expect, test } from "bun:test";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@envden/server";

import type { TFetch } from "../../client/fetch.ts";

import { atomicWrite } from "../../state/files.ts";

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
    const oldServer = await serve({ dataDir: snapshot, port: 0, now: opts.now });

    try {
      const oldFetch: TFetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        url.host = oldServer.server.url.host;

        return fetch(url, init);
      };

      await Promise.resolve(
        expect(pull(first, { ...opts, fetcher: oldFetch })).rejects.toMatchObject({
          code: "ROLLBACK",
        }),
      );
    } finally {
      await oldServer.server.stop(true);
      oldServer.storage.close();
      oldServer.stopPruning();
    }
  } finally {
    await fixture.cleanup();
  }
});
