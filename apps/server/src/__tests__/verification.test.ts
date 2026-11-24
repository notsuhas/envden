import { beforeAll, test, expect, spyOn } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture, identity, vaultId } from "./fixture.ts";
import type { IServerKeys } from "../http/types.ts";
import { text } from "../http/encoding.ts";
import { hasProof } from "../auth/token.ts";
import { nonMemberPolicy } from "../routes/policy.ts";

let keys: IServerKeys;

beforeAll(() => {
  keys = identity();
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
    expect(hello.body.protocols).toEqual([p.PROTOCOL_VERSION]);
    expect((await f.app.request("/v1/hello?challenge=AA")).status).toBe(400);
  } finally {
    f.close();
  }
});

// A member-only write: the body is uploaded as a blob whose hash names the path.
const path = `/v1/blobs/${text(p.H("blob", new TextEncoder().encode(JSON.stringify({ period: null }))))}`;

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

test("repair proofs bind requests", () => {
  const f = fixture(keys);

  try {
    const r = f.request(path).r;
    const auth = { request: r, member: true, proof: p.randomBytes(64) };
    const vault = f.storage.vault(vaultId)!;
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
  expect(nonMemberPolicy("POST", "/v1/recovery/ticket")).toBe("recovery");
  expect(nonMemberPolicy("POST", "/v1/join-requests")).toBe("join");
  expect(nonMemberPolicy("PUT", "/v1/join-requests/1/reveal")).toBe("join");
  expect(nonMemberPolicy("GET", "/v1/join-requests/approved")).toBe("approver");
  expect(nonMemberPolicy("GET", "/v1/join-requests")).toBeUndefined();
  expect(nonMemberPolicy("DELETE", "/v1/join-requests/1/offer")).toBeUndefined();
});

test("internal failures never expose their message", async () => {
  const f = fixture(keys);
  const log = spyOn(console, "error").mockImplementation(() => {});

  spyOn(f.storage, "hasVault").mockImplementation(() => {
    throw new Error("private database detail");
  });

  try {
    const response = await f.request("/v1/devices").send();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"INTERNAL"}');

    expect(log).toHaveBeenCalledWith(
      "envden request failed",
      expect.objectContaining({ code: "INTERNAL", method: "GET", name: "Error" }),
    );

    expect(JSON.stringify(log.mock.calls)).not.toContain("private database detail");
    log.mockRestore();
  } finally {
    f.close();
  }
});

test("zero vault rejected", async () => {
  const f = fixture(keys);

  try {
    const response = await f
      .request("/v1/head", undefined, {
        mutate: (r) => {
          r.vaultId = new Uint8Array(32);
        },
      })
      .send();

    expect(response.status).toBe(404);
  } finally {
    f.close();
  }
});

test("unchanged member versions do not write device state", async () => {
  const f = fixture(keys);
  const put = spyOn(f.storage, "putDevice");

  try {
    await f.request("/v1/head").send();
    expect(put).not.toHaveBeenCalled();
  } finally {
    put.mockRestore();
    f.close();
  }
});

test("fetching a join approval doesn't confirm the device, its next request does", async () => {
  const f = fixture(keys);
  const put = spyOn(f.storage, "putDevice");

  const newer = (r: p.IRequest) => {
    r.clientVersion = "1.1.0";
  };

  try {
    await f.request("/v1/join-requests/approved", undefined, { mutate: newer }).send();
    expect(put).not.toHaveBeenCalled();

    await f.request("/v1/head", undefined, { mutate: newer }).send();
    expect(put).toHaveBeenCalled();
  } finally {
    put.mockRestore();
    f.close();
  }
});

test("rejected unknown devices do not record nonces", async () => {
  const f = fixture(keys);
  const remember = spyOn(f.storage, "rememberNonce");

  try {
    await f.request("/v1/head", undefined, { who: f.joiner }).send();
    expect(remember).not.toHaveBeenCalled();
  } finally {
    remember.mockRestore();
    f.close();
  }
});
