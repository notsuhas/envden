import type { TFetch } from "../../client/fetch.ts";
import { test, expect } from "bun:test";
import { createSharedFixture } from "./shared-fixture.ts";

const fixtureClock = () => 1800000000000;

const syncFixture = createSharedFixture();

import { pull, push } from "../engine.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";
import * as p from "@envden/core/protocol";
import { readHistory } from "../../vault/history.ts";
import { syncContext } from "../remote/context.ts";

test("history requests only pages after the verified checkpoint", async () => {
  const fixture = await syncFixture();
  const { first, second, aStore, opts } = fixture;

  try {
    await pull(second, opts);
    const local = (await loadState(second.home))!;

    const last = p.decode(
      p.signedCodec(p.ManifestHeaderCodec),
      Buffer.from(local.headers.at(-1)!, "base64url"),
    );

    const entry = p.decode(
      p.signedCodec(p.EntryCodec),
      Buffer.from(local.entries.at(-1)!, "base64url"),
    );

    await atomicWrite(aStore, "TOKEN=next\n", fixtureClock);
    await push(first, opts);
    const requests: string[] = [];

    const fetcher: TFetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());

      if (url.pathname === "/v1/entries" || url.pathname === "/v1/headers")
        requests.push(url.pathname + url.search);

      return fixture.fetcher(input, init);
    };

    const context = await syncContext(second, { ...opts, fetcher });
    const history = await readHistory(context.client, context.vaultId, local);

    expect(requests).toEqual([
      `/v1/entries?from=${entry.body.seq + 1n}`,
      `/v1/headers?from=${last.body.seq + 1n}`,
      `/v1/headers?from=${last.body.seq + 2n}`,
    ]);

    expect(history.state).toBe(local.verifiedState!);
    expect(history.headers).toHaveLength(local.headers.length + 1);
  } finally {
    await fixture.cleanup();
  }
});
