import { expect, test } from "bun:test";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { TFetch } from "../../client/fetch.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { serverBytes } from "./interleaving/fixture.ts";
import { pull, push } from "../engine.ts";

const fixtureClock = () => 1800000000000;

const fixture = createSharedFixture();

function isSwap(input: Parameters<TFetch>[0]) {
  return new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/swap";
}

test("late superseded attempt advances the merge ancestor before retry", async () => {
  const f = await fixture();
  const targets = await approveLayout(f, ["copy"]);
  const path = join(targets[0]!.root, ".env");
  await atomicWrite(f.aStore, "ALPHA=a\nBETA=1\n", fixtureClock);
  await push(f.first, f.opts);
  await pull(f.second, f.opts);
  await atomicWrite(path, "ALPHA=b\nBETA=1\n", fixtureClock);
  let held: Parameters<TFetch> | undefined;

  const timeout: TFetch = async (input, init) => {
    if (isSwap(input)) {
      held = [
        input instanceof Request
          ? new Request(input.url, {
              method: input.method,
              body: await input.clone().arrayBuffer(),
            })
          : input,
        init,
      ];

      throw new Error("Timeout");
    }

    return f.fetcher(input, init);
  };

  await Promise.resolve(expect(push(f.second, { ...f.opts, fetcher: timeout })).rejects.toThrow());
  await atomicWrite(path, "ALPHA=a\nBETA=2\n", fixtureClock);
  let delivered = false;

  const late: TFetch = async (input, init) => {
    if (isSwap(input) && !delivered && held) {
      delivered = true;
      await f.fetcher(...held);
    }

    return f.fetcher(input, init);
  };

  await push(f.second, { ...f.opts, fetcher: late });
  expect(await serverBytes(f)).toBe("ALPHA=a\nBETA=2\n");
  expect(await readdir(join(f.second.home, "state", "attempts"))).toEqual([]);
  expect(await Bun.file(join(f.second.home, "state", "upload-attempt.json")).exists()).toBe(false);
  expect(await Bun.file(join(f.second.home, "state", "lineage")).exists()).toBe(false);
});

test("an attempt with a mismatched header is quarantined before a stale push", async () => {
  const f = await fixture();
  const targets = await approveLayout(f, ["copy"]);
  await atomicWrite(join(targets[0]!.root, ".env"), "TOKEN=edit\n", fixtureClock);

  const lost: TFetch = async (input, init) => {
    const response = await f.fetcher(input, init);
    if (isSwap(input)) throw new Error("Lost response");

    return response;
  };

  await Promise.resolve(expect(push(f.second, { ...f.opts, fetcher: lost })).rejects.toThrow());
  const directory = join(f.second.home, "state", "attempts");
  const name = (await readdir(directory))[0]!;
  const record = JSON.parse(await Bun.file(join(directory, name)).text());

  await atomicWrite(
    join(directory, name),
    JSON.stringify({ ...record, header: "invalid" }),
    fixtureClock,
  );

  await pull(f.first, f.opts);
  await atomicWrite(f.aStore, "TOKEN=local-test-value\n", fixtureClock);
  await push(f.first, f.opts);
  const result = await push(f.second, f.opts);
  expect(result.conflicts).toBe(1);
  expect(await serverBytes(f)).toBe("TOKEN=local-test-value\n");
});

test("an attempt sequence inconsistent with its proposal cannot be rejected as stale", async () => {
  const f = await fixture();
  const targets = await approveLayout(f, ["copy"]);
  await atomicWrite(join(targets[0]!.root, ".env"), "TOKEN=edit\n", fixtureClock);

  const lost: TFetch = async (input, init) => {
    if (isSwap(input)) throw new Error("Request not delivered");

    return f.fetcher(input, init);
  };

  await Promise.resolve(expect(push(f.second, { ...f.opts, fetcher: lost })).rejects.toThrow());
  const directory = join(f.second.home, "state", "attempts");
  const name = (await readdir(directory))[0]!;
  const record = JSON.parse(await Bun.file(join(directory, name)).text());

  await atomicWrite(
    join(directory, name),
    JSON.stringify({ ...record, sequence: "0" }),
    fixtureClock,
  );

  const result = await push(f.second, f.opts);
  expect(result.conflicts).toBe(1);
  expect(await serverBytes(f)).toBe("TOKEN=local-test-value\n");
});
