import { expect, test } from "bun:test";
import { base32, ManifestHeaderCodec, objectHash, signObject } from "../../protocol/index.ts";
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
    [{ ...f.file, blobHash: bytes(0) }],
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
