import { beforeAll, test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture, identity, vaultId } from "./fixture.ts";
import type { IServerKeys } from "../http/types.ts";
import { requireJoinTicket } from "../auth/ticket.ts";

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

const startPath = "/v1/opaque/login/start";
const finishPath = "/v1/opaque/login/finish";

async function login(f: ReturnType<typeof fixture>, purpose: "unlock" | "kit") {
  const who = purpose === "kit" ? f.joiner : f.member;
  const start = await p.opaqueStartLogin("password");

  const response = await f
    .request(startPath, { purpose, message: start.startLoginRequest }, { who })
    .send();

  expect(response.status).toBe(200);
  const body = p.MessageResponseSchema.parse(await response.json());

  const finish = await p.opaqueFinishLogin({
    password: "password",
    clientLoginState: start.clientLoginState,
    loginResponse: body.message,
    identifiers: p.unlockIdentifiers(vaultId).identifiers,
  });

  if (!finish) throw new Error("Client login failed");

  return { who, body: { purpose, message: finish.finishLoginRequest } };
}

for (const purpose of ["unlock", "kit"] as const) {
  test(`${purpose} login finishes once, refunds charge and binds its device`, async () => {
    const f = fixture(keys, record);

    try {
      const finish = await login(f, purpose);

      expect(
        (
          await f
            .request(finishPath, finish.body, { who: purpose === "kit" ? f.member : f.joiner })
            .send()
        ).status,
      ).toBe(purpose === "unlock" ? 401 : 403);

      const finished = await f.request(finishPath, finish.body, { who: finish.who }).send();
      expect(finished.status).toBe(200);

      expect(await finished.json()).toEqual(
        purpose === "kit"
          ? { kind: "ticket" }
          : { kind: "unlocked", unlockedUntil: 2593000000, freshUntil: 1600000 },
      );

      expect((await f.request(finishPath, finish.body, { who: finish.who }).send()).status).toBe(
        401,
      );

      if (purpose === "unlock") {
        expect(f.storage.device(vaultId, f.member.record.id)?.freshUntil).toBe(1600000);
        expect(f.storage.device(vaultId, f.member.record.id)?.unlockedUntil).toBe(2593000000);
      } else {
        const auth = { request: f.request("/").r, member: false };
        auth.request.device = f.joiner.record.id;
        expect(() => requireJoinTicket(f.options, auth)).not.toThrow();
        f.advance(600000);
        expect(() => requireJoinTicket(f.options, auth)).toThrow();
      }
    } finally {
      f.close();
    }
  });
}

test("expired login state cannot finish", async () => {
  const f = fixture(keys, record);

  try {
    const finish = await login(f, "unlock");
    f.advance(120000);
    expect((await f.request(finishPath, finish.body).send()).status).toBe(401);
  } finally {
    f.close();
  }
});

test("wrong KE3 consumes login state without refund", async () => {
  const f = fixture(keys, record);

  try {
    const finish = await login(f, "unlock");

    expect(
      (
        await f
          .request(finishPath, {
            purpose: "unlock",
            message: Buffer.from(p.randomBytes(64)).toString("base64url"),
          })
          .send()
      ).status,
    ).toBe(401);

    expect((await f.request(finishPath, finish.body).send()).status).toBe(401);
  } finally {
    f.close();
  }
});

test("five starts lock out members independently of kit bucket; finish refunds", async () => {
  const f = fixture(keys, record);

  try {
    let finish: Awaited<ReturnType<typeof login>> | undefined;
    for (let i = 0; i < 5; i++) finish = await login(f, "unlock");
    const start = await p.opaqueStartLogin("password");

    expect(
      (await f.request(startPath, { purpose: "unlock", message: start.startLoginRequest }).send())
        .status,
    ).toBe(429);

    expect(
      (
        await f
          .request(
            startPath,
            { purpose: "kit", message: start.startLoginRequest },
            { who: f.joiner },
          )
          .send()
      ).status,
    ).toBe(200);

    expect(finish).toBeDefined();
    expect((await f.request(finishPath, finish!.body).send()).status).toBe(200);

    expect(
      (await f.request(startPath, { purpose: "unlock", message: start.startLoginRequest }).send())
        .status,
    ).toBe(200);

    expect(
      (await f.request(startPath, { purpose: "unlock", message: start.startLoginRequest }).send())
        .status,
    ).toBe(429);
  } finally {
    f.close();
  }
});

test("kit failures share a vault bucket across candidate IDs", async () => {
  const f = fixture(keys, record);

  try {
    const start = await p.opaqueStartLogin("password");

    for (let i = 0; i < 5; i++)
      expect(
        (
          await f
            .request(
              startPath,
              { purpose: "kit", message: start.startLoginRequest },
              { who: f.joiner },
            )
            .send()
        ).status,
      ).toBe(200);

    expect(
      (
        await f
          .request(
            startPath,
            { purpose: "kit", message: start.startLoginRequest },
            { who: f.joiner },
          )
          .send()
      ).status,
    ).toBe(429);

    expect(
      (await f.request(startPath, { purpose: "unlock", message: start.startLoginRequest }).send())
        .status,
    ).toBe(200);
  } finally {
    f.close();
  }
});
