import { verifyChain } from "../devices/apply.ts";
import { EnvdenError } from "../../errors/index.ts";
import { expect, test } from "bun:test";
import {
  EntryCodec,
  base32,
  ManifestHeaderCodec,
  objectHash,
  signObject,
} from "../../protocol/index.ts";
import { acceptManifest } from "../manifests/accept.ts";
import { headerDescent, entryDescent } from "../manifests/descent.ts";
import { manifestFixture } from "./manifest-fixture.ts";
import { bytes, signedHeader } from "./fixtures.ts";

test("manifest accepts pushes and skipped headers across epoch changes", async () => {
  const f = manifestFixture();
  const rotated = f.rotate();
  const pushed = f.push(rotated, { entries: [{ ...f.file, epoch: 2 }] });
  const result = await acceptManifest(f.acceptInput(pushed));
  expect(result.kind).toBe("accepted");
  if (result.kind === "accepted") expect(result.headers.length).toBe(2);
  expect((await headerDescent(f.source, f.header, pushed, async () => {}))?.length).toBe(2);
  expect((await entryDescent(f.source, f.state, rotated.body)).length).toBe(1);
});

test("manifest classifies identical head, rollback, equal-seq fork and longer fork", async () => {
  const f = manifestFixture();
  expect((await acceptManifest(f.acceptInput(f.header))).kind).toBe("unchanged");
  const pushed = f.push();
  const accepted = await acceptManifest(f.acceptInput(pushed));
  if (accepted.kind !== "accepted") throw new Error("fixture");

  expect(
    (
      await acceptManifest({
        ...f.acceptInput(f.header),
        checkpoint: accepted.checkpoint,
        storedHeaders: [f.header, pushed],
      })
    ).kind,
  ).toBe("rollback");

  const fork = signObject(
    ManifestHeaderCodec,
    { ...f.header.body, createdAt: 2n },
    f.a.keys.objSk,
    "manifest",
  );

  expect((await acceptManifest(f.acceptInput(fork))).kind).toBe("fork");
  const forkHead = signedHeader(fork, { op: 1 });
  f.headers.set(base32(objectHash(ManifestHeaderCodec, fork, "manifest")), fork);
  expect((await acceptManifest(f.acceptInput(forkHead))).kind).toBe("fork");
});

for (const change of [
  "signature",
  "vault",
  "epoch",
  "keyring",
  "envelope",
  "signer",
  "list",
  "link",
] as const) {
  test(`manifest rejects bad ${change}`, async () => {
    const f = manifestFixture();
    const head = f.push();
    const body = { ...head.body };
    if (change === "vault") body.vaultId = bytes(0);
    if (change === "epoch") body.epoch = 0;
    if (change === "keyring") body.keyringHash = bytes(0);
    if (change === "envelope") body.envelopeHash = bytes(0);
    if (change === "signer") body.signer = f.recovery.id;
    if (change === "list") body.listSeq += 1n;
    if (change === "link") body.prev = bytes(0);
    const signed = signObject(ManifestHeaderCodec, body, f.a.keys.objSk, "manifest");
    if (change === "signature") signed.signature = bytes(0, 64);
    expect((await acceptManifest(f.acceptInput(signed))).kind).toBe("invalid");
  });
}

test("file IDs cannot drop, decrease versions or change at same version", async () => {
  const f = manifestFixture();
  const first = f.push();
  const accepted = await acceptManifest(f.acceptInput(first));
  if (accepted.kind !== "accepted") throw new Error("fixture");

  for (const entries of [
    [],
    [{ ...f.file, blobHash: bytes(30) }],
    [{ ...f.file, version: 0n }],
    [{ ...f.file, version: 2n, epoch: 2 }],
    [{ ...f.file, version: 2n, state: 3 }],
  ]) {
    if (entries[0]?.version === 0n) {
      const files = { entries: [{ ...f.file, version: 2n }] };
      const head = f.push(first, files);
      entries[0].version = 1n;
      f.lists.set(base32(head.body.filesHash), { entries });

      expect(
        (
          await acceptManifest({
            ...f.acceptInput(head),
            checkpoint: accepted.checkpoint,
            storedHeaders: [f.header, first],
          })
        ).kind,
      ).toBe("invalid");

      continue;
    }

    const head = f.push(first, { entries });

    expect(
      (
        await acceptManifest({
          ...f.acceptInput(head),
          checkpoint: accepted.checkpoint,
          storedHeaders: [f.header, first],
        })
      ).kind,
    ).toBe("invalid");
  }
});

test("crossed repair fixes report changes and prevent local fast-forward after later push", async () => {
  const f = manifestFixture();
  const first = f.push();

  const repair = f.push(
    first,
    { entries: [{ ...f.file, version: 2n, name: bytes(33), state: 4, blobHash: bytes(0) }] },
    11,
  );

  const later = f.push(repair, { entries: [{ ...f.file, version: 3n, name: bytes(34) }] });
  const result = await acceptManifest(f.acceptInput(later));
  expect(result.kind).toBe("accepted");

  if (result.kind === "accepted") {
    expect(result.repairs.length).toBe(1);
    expect(result.noFastForward.has(base32(f.file.fileId))).toBe(true);
  }

  f.lists.delete(base32(first.body.filesHash));
  expect((await acceptManifest(f.acceptInput(later))).kind).toBe("invalid");
});

for (const defect of ["hash", "decrypt", "id", "commit"] as const) {
  test(`keyring rejects ${defect}`, async () => {
    const f = manifestFixture();
    const head = f.rotate();
    if (defect === "hash") f.keyrings.set(base32(head.body.keyringHash), bytes(0));
    if (defect === "decrypt") f.source.epochKey = () => bytes(0);
    if (defect === "id") f.checkpoint.idKey = bytes(0);
    if (defect === "commit") f.checkpoint.state = { ...f.state, commits: new Map([[1, bytes(0)]]) };
    expect((await acceptManifest(f.acceptInput(head))).kind).toBe("invalid");
  });
}

test("unsigned divergent headers are invalid at equal sequence and during descent", async () => {
  const f = manifestFixture();
  const bad = { body: { ...f.header.body, createdAt: 2n }, signature: bytes(0, 64) };
  expect((await acceptManifest(f.acceptInput(bad))).kind).toBe("invalid");
  const head = signedHeader(bad, { op: 1 });
  f.headers.set(base32(objectHash(ManifestHeaderCodec, bad, "manifest")), bad);
  expect((await acceptManifest(f.acceptInput(head))).kind).toBe("invalid");
});

for (const longer of [false, true]) {
  test(`sibling device list at ${longer ? "greater" : "equal"} manifest sequence is a fork`, async () => {
    const f = manifestFixture();

    const sibling = signObject(
      EntryCodec,
      {
        ...f.epoch.body,
        kind: 3,
        payload: {
          change: { ...f.change(f.state), epoch: 1, keyCommit: bytes(77) },
        },
      },
      f.a.keys.objSk,
      "entry",
    );

    for (const entry of [f.genesis, sibling])
      f.entries.set(base32(objectHash(EntryCodec, entry, "entry")), entry);

    const fork = signedHeader(f.header, {
      seq: f.header.body.seq,
      listHead: objectHash(EntryCodec, sibling, "entry"),
    });

    f.headers.set(base32(objectHash(ManifestHeaderCodec, fork, "manifest")), fork);
    const head = longer ? signedHeader(fork, { op: 1 }) : fork;
    expect((await acceptManifest(f.acceptInput(head))).kind).toBe("fork");
    const forged = { ...sibling, signature: bytes(0, 64) };
    f.entries.set(base32(objectHash(EntryCodec, sibling, "entry")), forged);
    expect((await acceptManifest(f.acceptInput(head))).kind).toBe("invalid");
  });
}

for (const method of ["header", "files"] as const) {
  test(`manifest preserves ${method} source failures`, async () => {
    const f = manifestFixture();
    const head = f.push();

    for (const failure of [
      new Error("source failure"),
      new EnvdenError("NOT_FOUND", "Source unavailable"),
      new EnvdenError("INVALID_DATA", "Source unavailable"),
    ]) {
      f.source[method] = () => {
        throw failure;
      };

      await Promise.resolve(expect(acceptManifest(f.acceptInput(head))).rejects.toBe(failure));
    }
  });
}

test("foreign genesis cannot establish a fork at equal or greater sequence", async () => {
  const f = manifestFixture();
  const foreign = manifestFixture();
  if (foreign.genesis.body.kind !== 0) throw new Error("fixture genesis");

  const genesis = signObject(
    EntryCodec,
    {
      ...foreign.genesis.body,
      payload: { ...foreign.genesis.body.payload, device: foreign.b.record, vaultNonce: bytes(99) },
      signer: foreign.b.record.id,
    },
    foreign.b.keys.objSk,
    "entry",
  );

  const vaultId = objectHash(EntryCodec, genesis, "entry");

  const epoch = signObject(
    EntryCodec,
    {
      ...foreign.epoch.body,
      kind: 3,
      payload: {
        change: foreign.change({ ...foreign.state, vaultId, epoch: 0 }, [foreign.b.record]),
      },
      vaultId,
      parent: vaultId,
      signer: foreign.b.record.id,
    },
    foreign.b.keys.objSk,
    "entry",
  );

  expect(verifyChain([genesis, epoch]).kind).toBe("valid");

  const listHead = objectHash(EntryCodec, epoch, "entry");
  foreign.entries.set(base32(vaultId), genesis);
  foreign.entries.set(base32(listHead), epoch);

  for (const seq of [1n, 2n]) {
    const head = signedHeader(
      foreign.header,
      { vaultId, listHead, seq, signer: foreign.b.record.id },
      foreign.b,
    );

    expect((await acceptManifest({ ...f.acceptInput(head), source: foreign.source })).kind).toBe(
      "invalid",
    );
  }
});
