import { afterAll, beforeAll, expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { text } from "../http/encoding.ts";
import { vaultFixture } from "./vault-fixture.ts";

let restored: Awaited<ReturnType<typeof vaultFixture>>;

let proof: (r: p.IRequest) => Uint8Array;

// The rejection cases below write nothing, so one restored vault serves them all.
beforeAll(async () => {
  restored = await vaultFixture();
  await restored.initialize();
  const repair = p.randomBytes(32);

  restored.storage.configureVault(restored.vaultId, {
    ...restored.storage.vault(restored.vaultId)!,
    restored: { repairTokenHash: repair, restoredHead: restored.storage.head(restored.vaultId)! },
  });

  proof = (r) => p.tokenProof("repair", repair, r);
});

afterAll(() => restored.close());

for (const kind of ["files", "keyring"])
  test(`repair ${kind} rejects a non-member holding the token`, async () => {
    const response = await restored.request(
      `/v1/repair/material/${kind}/${text(p.randomBytes(32))}`,
      p.randomBytes(32),
      restored.b,
      proof,
      "PUT",
    );

    expect(response.status).toBe(403);
  });

test("restored reads require membership as well as the repair token", async () => {
  expect((await restored.request("/v1/head", undefined, restored.b, proof)).status).toBe(403);
  expect((await restored.request("/v1/head", undefined, restored.a, proof)).status).toBe(200);
});

for (const kind of ["keyring", "envelope", "proofPub"])
  test(`repair rejects unnamed ${kind}`, async () => {
    const bytes = p.randomBytes(32);

    const hash =
      kind === "proofPub"
        ? bytes
        : p.H(kind === "keyring" ? "keyring-blob" : "envelope-blob", bytes);

    const response = await restored.request(
      `/v1/repair/material/${kind}/${text(hash)}`,
      bytes,
      restored.a,
      proof,
      "PUT",
    );

    expect(response.status).toBe(400);
  });

test("zero vault cannot open a move session", async () => {
  const f = await vaultFixture();

  try {
    f.useVault(new Uint8Array(32));

    const response = await f.request("/v1/move/session", new Uint8Array(), f.a, (r) =>
      p.tokenProof("setup", f.setup, r),
    );

    expect(response.status).toBe(400);
    expect(f.storage.hasVault(new Uint8Array(32))).toBe(false);
  } finally {
    f.close();
  }
});

test("a large signed repair report is accepted", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();
    const repair = p.randomBytes(32);
    const repairId = p.randomBytes(32);
    const head = f.storage.head(f.vaultId)!;

    f.storage.configureVault(f.vaultId, {
      ...f.storage.vault(f.vaultId)!,
      restored: { repairTokenHash: repair, restoredHead: head, finishProgress: repairId },
    });

    const blobs = Array.from({ length: 100000 }, (_, i) => {
      const hash = new Uint8Array(32);
      new DataView(hash.buffer).setUint32(28, i);

      return hash;
    });

    const report = p.signObject(
      p.RepairReportCodec,
      {
        vaultId: f.vaultId,
        repairId,
        head,
        blobs,
        signer: f.a.record.id,
      },
      f.a.keys.objSk,
      "repair-report",
    );

    const response = await f.request(
      "/v1/repair/report",
      p.signedCodec(p.RepairReportCodec).write(report),
      f.a,
      (r) => p.tokenProof("repair", repair, r),
      "PUT",
    );

    expect(response.status).toBe(200);
  } finally {
    f.close();
  }
});
