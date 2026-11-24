import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { candidate, fixture, identity, vaultId } from "./fixture.ts";
import { text } from "../http/encoding.ts";

const base = "/v1/join-requests";

type TFixture = ReturnType<typeof fixture>;

function asJoiner(f: TFixture, method = "GET", who = f.joiner) {
  return {
    who,
    method,
    mutate: (r: p.IRequest) => {
      r.vaultId = new Uint8Array(32);
    },
  };
}

const commit = text(p.randomBytes(32));

async function open(f: TFixture, who = f.joiner) {
  const response = await f.request(base, { commit }, asJoiner(f, "POST", who)).send();

  return p.JoinOpenedSchema.parse(await response.json()).number;
}

const message = (length = 64) => ({ message: text(p.randomBytes(length)) });

test("a joiner opens a request without a vault; members see it until one claims it", async () => {
  const f = fixture(identity());

  try {
    const number = await open(f);
    const listed = p.JoinRequestsSchema.parse(await (await f.request(base).send()).json());
    expect(listed.requests).toEqual([{ number, name: "joiner", commit, expiresAt: 1600000 }]);
    expect((await f.request(base, undefined, { who: f.joiner }).send()).status).toBe(403);

    const offer = message();
    const path = `${base}/${number}/offer`;
    expect((await f.request(path, offer, { method: "PUT" }).send()).status).toBe(200);
    expect((await f.request(path, offer, { method: "PUT" }).send()).status).toBe(200);

    expect(p.JoinRequestsSchema.parse(await (await f.request(base).send()).json())).toEqual({
      requests: [],
    });

    const read = await f.request(path, undefined, asJoiner(f)).send();

    expect(p.JoinSlotResponseSchema.parse(await read.json())).toEqual({
      ...offer,
      expiresAt: 1600000,
    });

    expect(f.storage.joinRequest(number, f.options.now())?.claim).toEqual({
      vault: vaultId,
      device: f.member.record.id,
    });
  } finally {
    f.close();
  }
});

test("each side reads and writes only its own slots, in order", async () => {
  const f = fixture(identity());
  const outsider = candidate("outsider");

  try {
    const number = await open(f);
    const offer = `${base}/${number}/offer`;
    const reveal = `${base}/${number}/reveal`;

    expect((await f.request(reveal, message(), asJoiner(f, "PUT")).send()).status).toBe(409);
    expect((await f.request(offer, message(), asJoiner(f, "PUT")).send()).status).toBe(401);

    expect((await f.request(offer, undefined, asJoiner(f, "GET", outsider)).send()).status).toBe(
      401,
    );

    expect((await f.request(offer, message(), { method: "PUT" }).send()).status).toBe(200);
    const pending = await f.request(reveal).send();
    expect(await pending.json()).toEqual({ kind: "pending", expiresAt: 1600000 });

    const revealed = message();
    expect((await f.request(reveal, revealed, asJoiner(f, "PUT")).send()).status).toBe(200);
    expect((await f.request(reveal, revealed, asJoiner(f, "PUT")).send()).status).toBe(200);
    expect((await f.request(reveal, undefined, asJoiner(f)).send()).status).toBe(401);
    expect(p.MessageResponseSchema.parse({ message: revealed.message })).toEqual(revealed);

    const response = await f.request(reveal).send();
    expect(p.JoinSlotResponseSchema.parse(await response.json())).toMatchObject(revealed);

    expect((await f.request(reveal, message(), asJoiner(f, "PUT")).send()).status).toBe(409);
    expect((await f.request(reveal).send()).status).toBe(404);
  } finally {
    f.close();
  }
});

test("a claimed request can't be taken over, and either side can cancel it", async () => {
  const f = fixture(identity());

  try {
    const number = await open(f);

    expect(
      f.storage.writeJoinRequest(number, "offer", p.randomBytes(8), f.options.now(), {
        vault: p.randomBytes(32),
        device: p.randomBytes(16),
      }),
    ).toBe("written");

    const offer = `${base}/${number}/offer`;
    expect((await f.request(offer, message(), { method: "PUT" }).send()).status).toBe(401);

    expect(
      (await f.request(`${base}/${number}`, undefined, { method: "DELETE" }).send()).status,
    ).toBe(401);

    expect(
      (await f.request(`${base}/${number}`, undefined, asJoiner(f, "DELETE")).send()).status,
    ).toBe(200);

    expect(f.storage.joinRequest(number, f.options.now())).toBeUndefined();

    const next = await open(f);

    expect(
      (await f.request(`${base}/${next}/offer`, message(), { method: "PUT" }).send()).status,
    ).toBe(200);

    expect(
      (await f.request(`${base}/${next}`, undefined, { method: "DELETE" }).send()).status,
    ).toBe(200);
  } finally {
    f.close();
  }
});

test("messages are capped, requests expire after ten minutes, and openings are limited", async () => {
  const f = fixture(identity());

  try {
    const number = await open(f);
    const offer = `${base}/${number}/offer`;
    expect((await f.request(offer, message(4097), { method: "PUT" }).send()).status).toBe(400);
    f.advance(600000);
    expect((await f.request(offer, message(), { method: "PUT" }).send()).status).toBe(404);

    for (let i = 0; i < 9; i++) await open(f, candidate());

    const limited = await f
      .request(base, { commit: text(p.randomBytes(32)) }, asJoiner(f, "POST"))
      .send();

    expect(limited.status).toBe(429);
    expect((await f.request(base, { commit: "AA" }, asJoiner(f, "POST")).send()).status).toBe(400);
  } finally {
    f.close();
  }
});

test("rejected writers can't use up the joiner's write budget", async () => {
  const f = fixture(identity());

  try {
    const number = await open(f);
    await f.request(`${base}/${number}/offer`, message(), { method: "PUT" }).send();
    const reveal = `${base}/${number}/reveal`;

    for (let i = 0; i < 20; i++)
      expect(
        (await f.request(reveal, message(), asJoiner(f, "PUT", candidate())).send()).status,
      ).toBe(401);

    expect(
      (await f.request(reveal, message(), asJoiner(f, "PUT", candidate())).send()).status,
    ).toBe(429);

    expect((await f.request(reveal, message(), asJoiner(f, "PUT")).send()).status).toBe(200);
  } finally {
    f.close();
  }
});
