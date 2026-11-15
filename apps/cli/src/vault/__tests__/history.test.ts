import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import type { TClient } from "../../client/request.ts";
import { text } from "../../client/encoding.ts";
import { createGenesis } from "../genesis.ts";
import { readHistory } from "../history.ts";

test("history rejects a repair-done whose restoredHead isn't an earlier header", async () => {
  const keys = p.generateDeviceKeys();
  const identity = { keys, record: { ...keys, id: p.deviceId(keys), name: "test" } };
  const { vaultId, genesis, epoch } = await createGenesis(identity, new Uint8Array(32), 0);
  const zeros = new Uint8Array(32);

  const header = (seq: bigint, op: number, prev: Uint8Array, entry: p.ISigned<p.TEntry>) =>
    p.signObject(
      p.ManifestHeaderCodec,
      {
        vaultId,
        seq,
        op,
        prev,
        listSeq: entry.body.seq,
        listHead: p.objectHash(p.EntryCodec, entry, "entry"),
        epoch: 1,
        keyringHash: zeros,
        filesHash: zeros,
        envelopeHash: zeros,
        createdAt: 0n,
        signer: identity.record.id,
      },
      keys.objSk,
      "manifest",
    );

  const first = header(1n, 0, zeros, epoch);
  const firstHash = p.objectHash(p.ManifestHeaderCodec, first, "manifest");

  const history = (restoredHead: Uint8Array) => {
    const done = p.signObject<p.TEntry>(
      p.EntryCodec,
      {
        vaultId,
        seq: 2n,
        parent: p.objectHash(p.EntryCodec, epoch, "entry"),
        kind: 6,
        payload: { repairId: p.randomBytes(32), restoredHead },
        signer: identity.record.id,
      },
      keys.objSk,
      "entry",
    );

    return readHistory(
      served([genesis, epoch, done], [first, header(2n, 12, firstHash, done)]),
      vaultId,
    );
  };

  expect((await history(firstHash)).headers).toHaveLength(2);

  await Promise.resolve(
    expect(history(p.randomBytes(32))).rejects.toMatchObject({ code: "INVALID_DATA" }),
  );
});

function served(entries: p.ISigned<p.TEntry>[], headers: p.ISigned<p.IManifestHeader>[]) {
  const objects = {
    "/v1/entries": entries.map((e) => p.encode(p.signedCodec(p.EntryCodec), e)),
    "/v1/headers": headers.map((h) => p.encode(p.signedCodec(p.ManifestHeaderCodec), h)),
  };

  const request = async (path: string) => {
    const url = new URL(path, "http://history");
    const from = BigInt(url.searchParams.get("from")!);
    const all = objects[url.pathname as keyof typeof objects];
    const page = all.filter((raw) => p.u64.read(new p.Reader(raw.subarray(34, 42))) >= from);

    return Response.json({ objects: page.map(text) });
  };

  return { request } as unknown as TClient;
}
