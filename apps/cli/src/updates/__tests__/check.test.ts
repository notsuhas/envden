import type { TFetch } from "../../client/fetch.ts";
import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { checkRelease } from "../check.ts";
import { emptyState } from "../../state/model.ts";

test("signed feed applies unsafe versions, refuses replay and skips daily fetches", async () => {
  const primary = p.generateRecoveryKeys();
  const backup = p.generateRecoveryKeys();
  const trust = { generation: 1, keys: { primary: primary.objPub, backup: backup.objPub } };
  const state = emptyState("test");

  const body: p.IRelease = {
    generation: 1,
    seq: 1n,
    issuedAt: 1000n,
    expires: 2592001000n,
    latest: "1.0.0",
    unsafe: ["0.0.0"],
    builds: [],
    revokePrimary: 0,
    next: undefined,
  };

  const bytes = p.ReleaseFeedCodec.write({
    body,
    signatures: [{ key: 0, sig: p.Sign(primary.objSk, "release", p.ReleaseCodec.write(body)) }],
  });

  let calls = 0;

  const fetcher: TFetch = async () => {
    calls++;

    return new Response(bytes);
  };

  expect((await checkRelease(state, trust, 2000, fetcher)).kind).toBe("checked");
  expect(state.release?.unsafe).toEqual(["0.0.0"]);
  expect((await checkRelease(state, trust, 3000, fetcher)).kind).toBe("skipped");
  expect(calls).toBe(1);
  const invalid: TFetch = async () => new Response(new Uint8Array([1, 2]));
  expect((await checkRelease(state, trust, 4000, invalid, true)).kind).toBe("unavailable");
  expect(state.release?.primary?.seq).toBe(1n);
});

test("unconfigured checks never use the network", async () => {
  const state = emptyState("test");

  const network: TFetch = async () => {
    throw new Error("Unexpected network");
  };

  state.updateCheck = false;
  expect((await checkRelease(state, undefined, 1, network)).kind).toBe("unavailable");
  expect((await checkRelease(state, undefined, 1, network, true)).kind).toBe("unavailable");
});
