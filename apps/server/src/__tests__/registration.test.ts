import { beforeAll, test, expect, spyOn } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture, identity, vaultId } from "./fixture.ts";
import type { IServerKeys } from "../http/types.ts";
import { initializeSetup } from "../identity/setup.ts";

let keys: IServerKeys;

let record: string;

beforeAll(async () => {
  keys = await identity();
  const start = await p.opaqueStartRegistration("password");

  const response = await p.opaqueRegistrationResponse({
    serverSetup: keys.opaqueSetup,
    userIdentifier: p.unlockIdentifiers(vaultId).userIdentifier,
    registrationRequest: start.registrationRequest,
  });

  record = (
    await p.opaqueFinishRegistration({
      password: "password",
      clientRegistrationState: start.clientRegistrationState,
      registrationResponse: response.registrationResponse,
      identifiers: p.unlockIdentifiers(vaultId).identifiers,
    })
  ).registrationRecord;
});

test("registration requires proof or freshness and stages the record for swap commit", async () => {
  const f = fixture(keys, record);

  try {
    const refund = spyOn(f.storage, "refund");
    const start = await p.opaqueStartRegistration("new password");
    const path = "/v1/opaque/registration/start";
    expect((await f.request(path, { message: start.registrationRequest }).send()).status).toBe(401);
    f.fresh();
    const response = await f.request(path, { message: start.registrationRequest }).send();
    expect(response.status).toBe(200);
    const body = p.MessageResponseSchema.parse(await response.json());

    const finish = await p.opaqueFinishRegistration({
      password: "new password",
      clientRegistrationState: start.clientRegistrationState,
      registrationResponse: body.message,
      identifiers: p.unlockIdentifiers(vaultId).identifiers,
    });

    const finishPath = "/v1/opaque/registration/finish";

    expect(
      (await f.request(finishPath, { message: finish.registrationRecord }).send()).status,
    ).toBe(200);

    expect(
      (await f.request(finishPath, { message: finish.registrationRecord }).send()).status,
    ).toBe(401);

    expect(refund).not.toHaveBeenCalled();
    refund.mockRestore();

    expect(
      Buffer.from(f.storage.state(vaultId, "opaqueRecord", new Uint8Array())!).toString(
        "base64url",
      ),
    ).toBe(record);

    expect(
      Buffer.from(
        f.storage.session(
          vaultId,
          { kind: "login", device: f.member.record.id, purpose: "registration-record" },
          f.options.now(),
        )!,
      ).toString("base64url"),
    ).toBe(finish.registrationRecord);
  } finally {
    f.close();
  }
});

test("setup proof is limited to absent vaults and consumed at creation commit", async () => {
  const f = fixture(keys);

  try {
    const token = initializeSetup(
      f.storage,
      keys.publicKey,
      p.encodeToken("setup", p.randomBytes(20), p.serverPin(keys.publicKey)),
    )!;

    const key = p.tokenKey("setup", p.decodeToken("setup", token).secret);
    const start = await p.opaqueStartRegistration("password");
    const path = "/v1/opaque/registration/start";
    const absent = p.randomBytes(32);

    const mutate = (r: p.IRequest) => {
      r.vaultId = absent;
    };

    const proof = (r: p.IRequest) => p.tokenProof("setup", key, r);

    expect(
      (
        await f
          .request(path, { message: start.registrationRequest }, { who: f.joiner, mutate })
          .send()
      ).status,
    ).toBe(401);

    expect(
      (
        await f
          .request(path, { message: start.registrationRequest }, { who: f.joiner, mutate, proof })
          .send()
      ).status,
    ).toBe(200);

    expect(
      (await f.request(path, { message: start.registrationRequest }, { proof }).send()).status,
    ).toBe(401);

    f.storage.configureVault(
      absent,
      { active: true, frozen: false, skRefused: false, unlockPeriod: 2592000000 },
      [],
      key,
    );

    expect(f.storage.setupToken()).toBeUndefined();

    expect(
      (
        await f
          .request(
            path,
            { message: start.registrationRequest },
            {
              who: f.joiner,
              mutate: (r) => {
                r.vaultId = p.randomBytes(32);
              },
              proof,
            },
          )
          .send()
      ).status,
    ).toBe(401);
  } finally {
    f.close();
  }
});

for (const path of [
  "/v1/opaque/login/start",
  "/v1/opaque/login/finish",
  "/v1/opaque/registration/start",
  "/v1/opaque/registration/finish",
]) {
  test(`${path} rejects malformed message before WASM`, async () => {
    const f = fixture(keys, record);

    try {
      f.fresh();
      expect((await f.request(path, { purpose: "unlock", message: "AA" }).send()).status).toBe(400);
    } finally {
      f.close();
    }
  });
}

test("SK registration accepts the correct proof and rejects refused or wrong proofs", async () => {
  const f = fixture(keys, record);

  try {
    const secret = p.randomBytes(16);

    f.storage.writeState(vaultId, [
      { kind: "skPub", key: new Uint8Array(), bytes: p.skPub(secret, vaultId) },
    ]);

    const start = await p.opaqueStartRegistration("new password");
    const path = "/v1/opaque/registration/start";
    const body = { message: start.registrationRequest };
    const proof = (r: p.IRequest) => p.signSKProof(secret, vaultId, r);

    expect((await f.request(path, body, { proof: () => p.randomBytes(64) }).send()).status).toBe(
      401,
    );

    expect((await f.request(path, body, { proof }).send()).status).toBe(200);
    f.storage.configureVault(vaultId, { ...f.storage.vault(vaultId)!, skRefused: true });
    expect((await f.request(path, body, { proof }).send()).status).toBe(401);
  } finally {
    f.close();
  }
});
