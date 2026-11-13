import { expect, test } from "bun:test";
import { EntryCodec, equal, objectHash } from "../../../protocol/index.ts";
import { applyEntry } from "../../devices/apply.ts";
import { bytes, fixture, signedHeader } from "../../__tests__/fixtures.ts";
import { checkHeaderSignature } from "../signature.ts";
import type { IChainSource } from "../source.ts";

test("historical signatures use membership at the signed list head and reject corrupt ancestry", async () => {
  const f = fixture();

  const add = f.entry(f.state, {
    kind: 1,
    payload: {
      device: f.b.record,
      wrap: { recipient: f.b.record.id, enc: bytes(1), ct: bytes(2, 48) },
    },
  });

  const added = applyEntry(f.state, add);
  if (added.kind !== "valid") throw new Error("fixture");
  const entries = [f.genesis, f.epoch, add];

  const source: IChainSource = {
    entry: (hash) => entries.find((e) => equal(objectHash(EntryCodec, e, "entry"), hash)),
    header: () => undefined,
    files: () => undefined,
    keyring: () => undefined,
    epochKey: () => undefined,
  };

  await checkHeaderSignature(source, added.state, f.header);
  const joined = signedHeader(f.header, { listSeq: added.state.seq, listHead: added.state.head });
  await checkHeaderSignature(source, f.state, joined);

  for (const changes of [{ vaultId: bytes(99) }, { signer: f.b.record.id }])
    await Promise.resolve(
      expect(
        checkHeaderSignature(source, added.state, signedHeader(f.header, changes)),
      ).rejects.toThrow(),
    );

  await Promise.resolve(
    expect(
      checkHeaderSignature(source, added.state, { ...f.header, signature: bytes(0, 64) }),
    ).rejects.toThrow(),
  );

  await Promise.resolve(
    expect(
      checkHeaderSignature({ ...source, entry: () => undefined }, added.state, f.header),
    ).rejects.toThrow(),
  );

  const broken = { ...f.epoch, signature: bytes(0, 64) };

  await Promise.resolve(
    expect(
      checkHeaderSignature(
        { ...source, entry: (hash) => (equal(hash, f.state.head) ? broken : source.entry(hash)) },
        added.state,
        f.header,
      ),
    ).rejects.toThrow(),
  );

  const forged = { ...add, signature: bytes(0, 64) };
  const forgedHead = objectHash(EntryCodec, forged, "entry");

  await Promise.resolve(
    expect(
      checkHeaderSignature(
        { ...source, entry: (hash) => (equal(hash, forgedHead) ? forged : source.entry(hash)) },
        f.state,
        signedHeader(f.header, { listSeq: forged.body.seq, listHead: forgedHead }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_DATA" }),
  );
});
