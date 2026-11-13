import { beforeAll, test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { candidate, fixture, identity, vaultId } from "./fixture.ts";
import type { IServerKeys } from "../http/types.ts";
import { text } from "../http/encoding.ts";
import { requireMailboxGrant } from "../pairing/grant.ts";

let keys: IServerKeys;

beforeAll(async () => {
  keys = await identity();
});

const path = "/v1/pairing/mailboxes";

async function open(f: ReturnType<typeof fixture>) {
  const response = await f.request(path, {}).send();
  expect(response.status).toBe(200);
  const body = p.MailboxOpenedSchema.parse(await response.json());

  return Number(body.number);
}

test("mailbox slots enforce sides, order, identical retries and close on conflict", async () => {
  const f = fixture(keys);

  try {
    expect((await f.request(path, {}).send()).status).toBe(403);
    f.fresh();
    const freshUntil = f.storage.device(vaultId, f.member.record.id)?.freshUntil;
    const number = await open(f);
    expect(number).toBe(1);
    expect(f.storage.device(vaultId, f.member.record.id)?.freshUntil).toBe(freshUntil);
    const base = `${path}/${number}`;
    const ke1 = { message: text(p.randomBytes(96)) };
    expect((await f.request(`${base}/KE1`, ke1, { method: "PUT" }).send()).status).toBe(401);

    expect(
      (await f.request(`${base}/KE1`, ke1, { method: "PUT", who: f.joiner }).send()).status,
    ).toBe(200);

    expect(
      (await f.request(`${base}/KE1`, ke1, { method: "PUT", who: f.joiner }).send()).status,
    ).toBe(200);

    expect(
      (
        await f
          .request(
            `${base}/PairJoiner`,
            { message: text(p.randomBytes(42)) },
            { method: "PUT", who: f.joiner },
          )
          .send()
      ).status,
    ).toBe(409);

    expect((await f.request(`${base}/KE1`).send()).status).toBe(200);

    expect(
      (
        await f
          .request(
            `${base}/KE2`,
            { message: text(p.randomBytes(320)) },
            { method: "PUT", who: f.joiner },
          )
          .send()
      ).status,
    ).toBe(401);

    expect(
      (
        await f
          .request(`${base}/KE2`, { message: text(p.randomBytes(320)) }, { method: "PUT" })
          .send()
      ).status,
    ).toBe(200);

    expect((await f.request(`${base}/KE2`, undefined, { who: f.joiner }).send()).status).toBe(200);

    expect(
      (
        await f
          .request(
            `${base}/KE3`,
            { message: text(p.randomBytes(64)) },
            { method: "PUT", who: f.joiner },
          )
          .send()
      ).status,
    ).toBe(200);

    expect(
      (
        await f
          .request(
            `${base}/PairJoiner`,
            { message: text(p.randomBytes(42)) },
            { method: "PUT", who: f.joiner },
          )
          .send()
      ).status,
    ).toBe(200);

    expect(() =>
      requireMailboxGrant(f.options, { request: f.request("/").r, member: true }, number),
    ).not.toThrow();

    expect(
      (
        await f
          .request(
            `${base}/KE1`,
            { message: text(p.randomBytes(96)) },
            { method: "PUT", who: f.joiner },
          )
          .send()
      ).status,
    ).toBe(409);

    expect((await f.request(`${base}/KE1`).send()).status).toBe(404);
  } finally {
    f.close();
  }
});

test("mailbox expiry, bound joiner, limits and number reuse", async () => {
  const f = fixture(keys);

  try {
    f.fresh();
    const number = await open(f);
    const message = { message: text(p.randomBytes(96)) };

    expect(
      (await f.request(`${path}/${number}/KE1`, message, { method: "PUT", who: f.joiner }).send())
        .status,
    ).toBe(200);

    expect(
      (
        await f
          .request(`${path}/${number}/KE1`, message, { method: "PUT", who: candidate("stranger") })
          .send()
      ).status,
    ).toBe(401);

    expect(
      (await f.request(`${path}/${number}`, undefined, { method: "DELETE" }).send()).status,
    ).toBe(200);

    expect(await open(f)).toBe(number);

    expect(
      (
        await f
          .request(`${path}/${number}/KE1`, message, {
            method: "PUT",
            who: candidate("replacement"),
          })
          .send()
      ).status,
    ).toBe(200);

    for (let i = 0; i < 8; i++) await open(f);
    expect((await f.request(path, {}).send()).status).toBe(429);
    f.advance(600000);
    expect((await f.request(`${path}/${number}/KE1`).send()).status).toBe(404);

    expect(() =>
      requireMailboxGrant(f.options, { request: f.request("/").r, member: true }, number),
    ).toThrow();
  } finally {
    f.close();
  }
});

test("PairApprover is fetched by authenticated device ID and expires after 24h", async () => {
  const f = fixture(keys);

  try {
    expect(
      (await f.request("/v1/pairing/approver", undefined, { who: f.joiner }).send()).status,
    ).toBe(404);

    const manifestHash = p.randomBytes(32);
    const channelKey = p.randomBytes(32);

    const bytes = p.sealPairApprover(
      { vaultId, serverPin: p.serverPin(keys.publicKey), manifestHash },
      channelKey,
    );

    f.storage.commitSwap(
      vaultId,
      f.storage.head(vaultId),
      {
        header: {
          seq: 2n,
          hash: manifestHash,
          bytes: f.storage.header(vaultId, f.storage.head(vaultId)!)!.bytes,
        },
        entries: [],
        bodyDigest: p.randomBytes(32),
        approver: { device: f.joiner.record.id, bytes },
      },
      f.options.now(),
    );

    const response = await f.request("/v1/pairing/approver", undefined, { who: f.joiner }).send();
    expect(response.status).toBe(200);
    const body = p.MessageResponseSchema.parse(await response.json());

    expect(
      p.openPairApprover(Buffer.from(body.message, "base64url"), channelKey).manifestHash,
    ).toEqual(manifestHash);

    expect(
      (await f.request("/v1/pairing/approver", undefined, { who: f.joiner }).send()).status,
    ).toBe(200);

    f.advance(86400000);

    expect(
      (await f.request("/v1/pairing/approver", undefined, { who: f.joiner }).send()).status,
    ).toBe(404);

    const other = candidate("other");

    expect((await f.request("/v1/pairing/approver", undefined, { who: other }).send()).status).toBe(
      404,
    );
  } finally {
    f.close();
  }
});
