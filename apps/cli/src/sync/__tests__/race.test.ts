import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const fixtureClock = () => 1800000000000;

import type { TFetch } from "../../client/fetch.ts";
import { loadState } from "../../state/store/repository.ts";
import { atomicWrite } from "../../state/store/files.ts";

import { push, pull } from "../engine.ts";

import { createSharedFixture } from "./shared-fixture.ts";

const syncFixture = createSharedFixture();

test("sync race", async () => {
  const fixture = await syncFixture();
  const { first, second, checkoutB, aStore, opts } = fixture;

  try {
    expect((await pull(second, opts)).conflicts).toBe(0);
    expect(await readFile(join(checkoutB.root, ".env"), "utf8")).toBe("TOKEN=local-test-value\n");
    const bStore = (await loadState(second.home))!.links[0]!.store;
    await atomicWrite(aStore, "TOKEN=local-test-value\nA=one\n", fixtureClock);
    expect((await push(first, opts)).kind).toBe("pushed");
    await pull(second, opts);
    expect(await readFile(bStore, "utf8")).toContain("A=one");
    await atomicWrite(aStore, "TOKEN=local-test-value\nA=two\n", fixtureClock);
    await atomicWrite(bStore, "TOKEN=local-test-value\nA=one\nB=one\n", fixtureClock);
    let raced = false;

    const racingFetch: TFetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());

      if (url.pathname === "/v1/swap" && !raced) {
        raced = true;
        await push(first, opts);
      }

      return fixture.fetcher(input, init);
    };

    expect((await push(second, { ...opts, fetcher: racingFetch })).kind).toBe("pushed");
    expect(raced).toBe(true);
    expect(await readFile(bStore, "utf8")).toBe("TOKEN=local-test-value\nA=two\nB=one\n");

    await pull(first, opts);
    let round = 0;

    const alwaysRacing: TFetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());

      if (url.pathname === "/v1/swap") {
        await atomicWrite(
          aStore,
          `TOKEN=local-test-value\nA=two\nB=one\nC=${++round}\n`,
          fixtureClock,
        );

        await push(first, opts);
      }

      return fixture.fetcher(input, init);
    };

    await atomicWrite(bStore, "TOKEN=local-test-value\nA=two\nB=two\n", fixtureClock);

    await Promise.resolve(
      expect(push(second, { ...opts, fetcher: alwaysRacing })).rejects.toMatchObject({
        code: "HEAD_MOVED",
        message: "Another device kept changing files during sync. Run the command again",
      }),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("accept refreshes history when a newer head appears", async () => {
  const { syncContext } = await import("../remote/context.ts");
  const { acceptHead } = await import("../remote/accept.ts");
  const { readHistory } = await import("../../vault/history.ts");
  const f = await syncFixture();

  try {
    const context = await syncContext(f.second, f.opts);
    const history = await readHistory(context.client, context.vaultId, context.state);
    await atomicWrite(f.aStore, "TOKEN=one\n", fixtureClock);
    await push(f.first, f.opts);
    await atomicWrite(f.aStore, "TOKEN=two\n", fixtureClock);
    await push(f.first, f.opts);
    await acceptHead(context, history);
    expect(context.checkpoint.header.body.seq).toBe(history.headers.at(-1)!.body.seq + 2n);
  } finally {
    await f.cleanup();
  }
});

test("an expired unlock prompts when interactive and names envden unlock otherwise", async () => {
  const f = await syncFixture();
  let locked = true;
  let prompts = 0;

  const lockedUntilLogin: TFetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());

    if (locked && url.pathname !== "/v1/hello")
      return Response.json({ error: "LOCKED" }, { status: 403 });

    return f.fetcher(input, init);
  };

  const opts = { ...f.opts, fetcher: lockedUntilLogin };

  try {
    await Promise.resolve(
      expect(pull(f.second, { ...opts, interactive: false })).rejects.toMatchObject({
        code: "LOCKED",
        message: "Unlock expired. Run envden unlock",
      }),
    );

    const unlock = async () => {
      prompts++;
      locked = false;
    };

    expect((await pull(f.second, { ...opts, interactive: true, unlock })).kind).toBe("pulled");
    expect(prompts).toBe(1);
  } finally {
    await f.cleanup();
  }
});
