import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultFixture } from "./vault-fixture.ts";
import { membership } from "../vault/chain.ts";

test("create, upload, push, head race and digest retry", async () => {
  const f = await vaultFixture();

  try {
    expect((await f.initialize()).status).toBe(200);
    expect((await f.initialize()).status).toBe(200);
    expect(f.storage.setupToken()).toBeDefined();
    expect(f.storage.setupToken()).not.toEqual(f.setup);
    expect(membership(f.storage, f.vaultId, f.a.record.id)).toEqual(f.a.record);
    const bytes = p.randomBytes(64);
    const hash = p.H("blob", bytes);

    const files = {
      entries: [
        {
          fileId: p.randomBytes(32),
          version: 1n,
          epoch: 1,
          state: 1,
          blobHash: hash,
          name: p.randomBytes(32),
        },
      ],
    };

    const swap = f.next(f.create.header, {
      op: 1,
      filesHash: p.H("files", p.FilesCodec.write(files)),
    });

    swap.files = files;
    expect((await f.send(swap)).status).toBe(400);

    expect(
      (await f.request(`/v1/blobs/${p.base32(hash)}`, bytes, f.a, undefined, "PUT")).status,
    ).toBe(400);

    const path = `/v1/blobs/${Buffer.from(hash).toString("base64url")}`;
    expect((await f.request(path, bytes, f.a, undefined, "PUT")).status).toBe(200);
    expect(await (await f.send(swap)).json()).toEqual({ kind: "committed" });
    const race = f.next(f.create.header, { ...swap.header.body, createdAt: 2n });
    race.files = files;
    expect((await f.send(race)).status).toBe(409);
    expect(await (await f.send(swap)).json()).toEqual({ kind: "retry-of-committed" });
  } finally {
    f.close();
  }
});

test("read sets enforce locked, fresh, ticket and secret-key proof", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();

    f.storage.putDevice(f.vaultId, f.a.record.id, {
      unlockedUntil: 0,
      freshUntil: 0,
      clientVersion: "1.0.0",
    });

    expect((await f.request("/v1/head")).status).toBe(403);
    const proof = (r: p.IRequest) => p.Sign(f.sk.objSk, "sk-proof", p.RequestCodec.write(r));
    expect((await f.request("/v1/head", undefined, f.a, proof)).status).toBe(200);
    expect((await f.request("/v1/envelope", undefined, f.a, proof)).status).toBe(200);
    expect((await f.request("/v1/head", undefined, f.b)).status).toBe(401);

    f.storage.putSession(
      f.vaultId,
      { kind: "join-ticket", device: f.b.record.id, purpose: "kit" },
      new Uint8Array([1]),
      f.options.now(),
    );

    expect((await f.request("/v1/head", undefined, f.b)).status).toBe(200);

    expect(
      (
        await f.request(
          `/v1/blobs/${Buffer.from(p.randomBytes(32)).toString("base64url")}`,
          undefined,
          f.b,
        )
      ).status,
    ).toBe(401);
  } finally {
    f.close();
  }
});
