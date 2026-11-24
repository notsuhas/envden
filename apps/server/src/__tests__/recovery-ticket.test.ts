import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultFixture } from "./vault-fixture.ts";
import { text } from "../http/encoding.ts";

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

test("a recovery proof under the stored proof key issues a one-device ticket", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();
    f.useVault(new Uint8Array(32));
    const body = json({ proofPub: text(p.proofPub(f.code)) });
    const proof = (r: p.IRequest) => p.signRecoveryProof(f.code, r);
    const wrong = (r: p.IRequest) => p.signRecoveryProof(p.generateRecoveryCode(), r);

    expect((await f.request("/v1/recovery/ticket", body, f.b)).status).toBe(401);
    expect((await f.request("/v1/recovery/ticket", body, f.b, wrong)).status).toBe(401);

    const issued = await f.request("/v1/recovery/ticket", body, f.b, proof);

    expect(p.RecoveryTicketResponseSchema.parse(await issued.json())).toEqual({
      vaultId: text(f.vaultId),
    });

    f.useVault(f.vaultId);
    expect((await f.request("/v1/head", undefined, f.b)).status).toBe(200);
    expect((await f.request("/v1/envelope", undefined, f.b)).status).toBe(200);
    expect((await f.request("/v1/head", undefined, f.candidate())).status).toBe(401);
  } finally {
    f.close();
  }
});

test("unknown codes say the vault may have moved; failures lock out, but never a valid proof", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();
    f.useVault(new Uint8Array(32));
    const other = p.generateRecoveryCode();
    const body = json({ proofPub: text(p.proofPub(other)) });
    const proof = (r: p.IRequest) => p.signRecoveryProof(other, r);
    const response = await f.request("/v1/recovery/ticket", body, f.b, proof);

    expect(await response.json()).toEqual({
      error: "UNAUTHORIZED",
      hint: "The vault may have moved; try the current server address",
    });

    for (let i = 0; i < 4; i++) await f.request("/v1/recovery/ticket", body, f.b, proof);
    expect((await f.request("/v1/recovery/ticket", body, f.b, proof)).status).toBe(429);

    const real = json({ proofPub: text(p.proofPub(f.code)) });

    const accepted = await f.request("/v1/recovery/ticket", real, f.b, (r) =>
      p.signRecoveryProof(f.code, r),
    );

    expect(accepted.status).toBe(200);
  } finally {
    f.close();
  }
});

test("a stale code or a restored vault issues no ticket, and a valid proof never counts", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();
    f.useVault(new Uint8Array(32));
    const body = json({ proofPub: text(p.proofPub(f.code)) });
    const proof = (r: p.IRequest) => p.signRecoveryProof(f.code, r);
    const vault = f.storage.vault(f.vaultId)!;
    f.storage.configureVault(f.vaultId, { ...vault, proofRefused: true });

    for (let i = 0; i < 6; i++)
      expect((await f.request("/v1/recovery/ticket", body, f.b, proof)).status).toBe(409);

    f.storage.configureVault(f.vaultId, vault);
    expect((await f.request("/v1/recovery/ticket", body, f.b, proof)).status).toBe(200);
  } finally {
    f.close();
  }
});
