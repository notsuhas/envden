import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { text } from "../http/encoding.ts";
import { vaultFixture } from "./vault-fixture.ts";

for (const kind of ["files", "keyring", "envelope", "skPub"])
  test(`repair ${kind} rejects a non-member holding the token`, async () => {
    const f = await vaultFixture();

    try {
      await f.initialize();
      const repair = p.randomBytes(32);

      f.storage.configureVault(f.vaultId, {
        ...f.storage.vault(f.vaultId)!,
        restored: { repairTokenHash: repair, restoredHead: f.storage.head(f.vaultId)! },
      });

      const response = await f.request(
        `/v1/repair/material/${kind}/${text(p.randomBytes(32))}`,
        p.randomBytes(32),
        f.b,
        (r) => p.tokenProof("repair", repair, r),
        "PUT",
      );

      expect(response.status).toBe(403);
    } finally {
      f.close();
    }
  });

for (const kind of ["keyring", "envelope", "skPub"])
  test(`repair rejects unnamed ${kind}`, async () => {
    const f = await vaultFixture();

    try {
      await f.initialize();
      const repair = p.randomBytes(32);

      f.storage.configureVault(f.vaultId, {
        ...f.storage.vault(f.vaultId)!,
        restored: { repairTokenHash: repair, restoredHead: f.storage.head(f.vaultId)! },
      });

      const bytes = p.randomBytes(32);

      const hash =
        kind === "skPub"
          ? bytes
          : p.H(kind === "keyring" ? "keyring-blob" : "envelope-blob", bytes);

      const response = await f.request(
        `/v1/repair/material/${kind}/${text(hash)}`,
        bytes,
        f.a,
        (r) => p.tokenProof("repair", repair, r),
        "PUT",
      );

      expect(response.status).toBe(400);
    } finally {
      f.close();
    }
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
