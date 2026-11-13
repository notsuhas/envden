import { beforeAll, test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture, identity, vaultId } from "./fixture.ts";
import type { IServerKeys } from "../http/types.ts";
import { text } from "../http/encoding.ts";
import { hasProof } from "../auth/token.ts";
import { gateMiddleware } from "../middleware/gates.ts";
import { nonMemberPolicy } from "../routes/policy.ts";

let keys: IServerKeys;

beforeAll(async () => {
  keys = await identity();
});

test("hello binds challenge, lowercased host and configured versions", async () => {
  const f = fixture(keys);

  try {
    const challenge = p.randomBytes(32);

    const response = await f.app.request(
      `http://EXAMPLE.test/v1/hello?challenge=${text(challenge)}`,
    );

    const json = p.HelloResponseSchema.parse(await response.json());
    const hello = p.decode(p.signedCodec(p.ServerHelloCodec), Buffer.from(json.hello, "base64url"));

    expect(response.status).toBe(200);

    expect(
      p.verifyHello(hello, challenge, "example.test", p.serverPin(keys.publicKey), "1.0.0").ok,
    ).toBe(true);

    expect(hello.body.minClient).toBe("1.0.0");
    expect(hello.body.protocols).toEqual([1]);
    expect((await f.app.request("/v1/hello?challenge=AA")).status).toBe(400);
  } finally {
    f.close();
  }
});

const path = "/v1/settings/unlock-period";

for (const [name, mutate, status] of [
  [
    "wrong pin",
    (r: p.IRequest) => {
      r.serverPin = p.randomBytes(32);
    },
    401,
  ],
  [
    "stale time",
    (r: p.IRequest) => {
      r.time -= 300001n;
    },
    401,
  ],
  [
    "future time",
    (r: p.IRequest) => {
      r.time += 300001n;
    },
    401,
  ],
  [
    "old client",
    (r: p.IRequest) => {
      r.clientVersion = "0.9.9";
    },
    426,
  ],
  [
    "wrong vault",
    (r: p.IRequest) => {
      r.vaultId = p.randomBytes(32);
    },
    404,
  ],
  [
    "wrong body",
    (r: p.IRequest) => {
      r.bodyHash = p.randomBytes(32);
    },
    401,
  ],
  [
    "wrong path",
    (r: p.IRequest) => {
      r.pathAndQuery = path + "?other";
    },
    401,
  ],
  [
    "wrong method",
    (r: p.IRequest) => {
      r.method = "GET";
    },
    401,
  ],
] as const) {
  test(`request rejects ${name}`, async () => {
    const f = fixture(keys);

    try {
      f.fresh();

      expect(
        (await f.request(path, { period: null }, { method: "PUT", mutate }).send()).status,
      ).toBe(status);
    } finally {
      f.close();
    }
  });
}

test("signature, replay, required headers and non-member gating", async () => {
  const f = fixture(keys);

  try {
    f.fresh();

    expect(
      (
        await f
          .request(
            path,
            { period: null },
            { method: "PUT", headers: { "Envden-Signature": text(p.randomBytes(64)) } },
          )
          .send()
      ).status,
    ).toBe(401);

    const req = f.request(path, { period: null }, { method: "PUT" });
    expect((await req.send()).status).toBe(200);
    expect((await req.send()).status).toBe(401);
    expect((await f.app.request(path, { method: "PUT" })).status).toBe(400);

    expect(
      (await f.request(path, { period: null }, { method: "PUT", who: f.joiner }).send()).status,
    ).toBe(403);

    expect(f.storage.device(vaultId, f.member.record.id)?.clientVersion).toBe("1.0.0");
  } finally {
    f.close();
  }
});

test("fresh and unlocked gates enforce boundaries and never period", async () => {
  const f = fixture(keys);

  f.app.get("/v1/test-unlocked", gateMiddleware(f.options, "unlocked"), (c) =>
    c.json({ ok: true }),
  );

  try {
    expect((await f.request(path, { period: null }, { method: "PUT" }).send()).status).toBe(403);
    expect((await f.request("/v1/test-unlocked").send()).status).toBe(403);
    f.fresh();

    expect((await f.request(path, { period: 86400000 }, { method: "PUT" }).send()).status).toBe(
      200,
    );

    expect(f.storage.vault(vaultId)?.unlockPeriod).toBe(86400000);
    expect((await f.request(path, { period: 1 }, { method: "PUT" }).send()).status).toBe(400);
    expect((await f.request(path, { period: null }, { method: "PUT" }).send()).status).toBe(200);
    f.advance(10000);
    expect((await f.request(path, { period: null }, { method: "PUT" }).send()).status).toBe(403);
    expect((await f.request("/v1/test-unlocked").send()).status).toBe(200);
  } finally {
    f.close();
  }
});

test("SK and repair proofs bind requests and honor refusal", () => {
  const f = fixture(keys);

  try {
    const secret = p.randomBytes(16);
    const pub = p.skPub(secret, vaultId);
    f.storage.writeState(vaultId, [{ kind: "skPub", key: new Uint8Array(), bytes: pub }]);
    const r = f.request(path).r;
    const auth = { request: r, member: true, proof: p.signSKProof(secret, vaultId, r) };
    expect(hasProof(f.options, auth, "sk")).toBe(true);
    expect(hasProof(f.options, { ...auth, proof: p.randomBytes(64) }, "sk")).toBe(false);
    const vault = f.storage.vault(vaultId)!;
    f.storage.configureVault(vaultId, { ...vault, skRefused: true });
    expect(hasProof(f.options, auth, "sk")).toBe(false);
    const repairTokenHash = p.tokenKey("repair", p.randomBytes(20));

    f.storage.configureVault(vaultId, {
      ...vault,
      restored: { repairTokenHash, restoredHead: p.randomBytes(32) },
    });

    expect(
      hasProof(f.options, { ...auth, proof: p.tokenProof("repair", repairTokenHash, r) }, "repair"),
    ).toBe(true);

    expect(hasProof(f.options, auth, "repair")).toBe(false);
  } finally {
    f.close();
  }
});

test("non-member policy is closed and method-specific", () => {
  expect(nonMemberPolicy("POST", "/v1/opaque/login/start")).toBe("kit");
  expect(nonMemberPolicy("POST", "/v1/opaque/registration/finish")).toBe("registration");
  expect(nonMemberPolicy("PUT", "/v1/pairing/mailboxes/1/KE1")).toBe("mailbox");
  expect(nonMemberPolicy("GET", "/v1/pairing/approver")).toBe("approver");
  expect(nonMemberPolicy("POST", "/v1/pairing/mailboxes")).toBeUndefined();
  expect(nonMemberPolicy("DELETE", "/v1/pairing/mailboxes/1/KE1")).toBeUndefined();
});

test("internal failures never expose their message", async () => {
  const f = fixture(keys);

  f.app.get("/v1/test-error", () => {
    throw new Error("private database detail");
  });

  try {
    const response = await f.request("/v1/test-error").send();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"INTERNAL"}');
  } finally {
    f.close();
  }
});
