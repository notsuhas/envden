import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { TFetch } from "../../client/fetch.ts";
import { loadState } from "../../state/repository.ts";
import { atomicWrite } from "../../state/files.ts";

import { push, pull } from "../engine.ts";

import { syncFixture } from "./flows.ts";

test("sync race", async () => {
  const fixture = await syncFixture();
  const { first, second, checkoutB, aStore, opts } = fixture;

  try {
    expect((await pull(second, opts)).conflicts).toBe(0);
    expect(await readFile(join(checkoutB.root, ".env"), "utf8")).toBe("TOKEN=local-test-value\n");
    const bStore = (await loadState(second.home))!.links[0]!.store;
    await atomicWrite(aStore, "TOKEN=local-test-value\nA=one\n");
    expect((await push(first, opts)).kind).toBe("pushed");
    await pull(second, opts);
    expect(await readFile(bStore, "utf8")).toContain("A=one");
    await atomicWrite(aStore, "TOKEN=local-test-value\nA=two\n");
    await atomicWrite(bStore, "TOKEN=local-test-value\nA=one\nB=one\n");
    let raced = false;

    const racingFetch: TFetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());

      if (url.pathname === "/v1/swap" && !raced) {
        raced = true;
        await push(first, opts);
      }

      return fetch(input, init);
    };

    expect((await push(second, { ...opts, fetcher: racingFetch })).kind).toBe("pushed");
    expect(raced).toBe(true);
    expect(await readFile(bStore, "utf8")).toBe("TOKEN=local-test-value\nA=two\nB=one\n");
  } finally {
    await fixture.cleanup();
  }
});
