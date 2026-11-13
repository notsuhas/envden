import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture, identity, vaultId } from "./fixture.ts";
import { text } from "../http/encoding.ts";
import { requireMailboxGrant } from "../pairing/grant.ts";

const base = "/v1/pairing/mailboxes";

test("joiner can pair before learning vault ID and grant is consumed by atomic pair commit", async () => {
  const f = fixture(await identity());

  try {
    f.fresh();
    const opened = await f.request(base, {}).send();
    const { number } = p.MailboxOpenedSchema.parse(await opened.json());
    const auth = { request: f.request("/").r, member: true };

    const joiner = {
      who: f.joiner,
      method: "PUT",
      mutate: (r: p.IRequest) => {
        r.vaultId = new Uint8Array(32);
      },
    };

    expect(
      (
        await f
          .request(`${base}/${number}/KE1`, { message: text(p.randomBytes(96)) }, joiner)
          .send()
      ).status,
    ).toBe(200);

    expect(
      (
        await f
          .request(
            `${base}/${number}/KE2`,
            { message: text(p.randomBytes(320)) },
            { method: "PUT" },
          )
          .send()
      ).status,
    ).toBe(200);

    expect(
      (
        await f
          .request(`${base}/${number}/KE3`, { message: text(p.randomBytes(64)) }, joiner)
          .send()
      ).status,
    ).toBe(200);

    const message = p.sealPairJoiner({ device: f.joiner.record }, p.randomBytes(32));

    expect(
      (await f.request(`${base}/${number}/PairJoiner`, { message: text(message) }, joiner).send())
        .status,
    ).toBe(200);

    expect(() => requireMailboxGrant(f.options, auth, number)).not.toThrow();
    const manifestHash = p.randomBytes(32);

    const approver = p.sealPairApprover(
      { vaultId, serverPin: p.serverPin(f.options.serverKeys.publicKey), manifestHash },
      p.randomBytes(32),
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
        closeMailbox: number,
        approver: { device: f.joiner.record.id, bytes: approver },
      },
      f.options.now(),
    );

    expect(() => requireMailboxGrant(f.options, auth, number)).toThrow();

    const response = await f
      .request("/v1/pairing/approver", undefined, { ...joiner, method: "GET" })
      .send();

    expect(response.status).toBe(200);
    expect(p.MessageResponseSchema.parse(await response.json()).message).toBe(text(approver));
  } finally {
    f.close();
  }
});

test("oversized mailbox payload is rejected", async () => {
  const f = fixture(await identity());

  try {
    f.fresh();
    const response = await f.request(base, {}).send();
    const { number } = p.MailboxOpenedSchema.parse(await response.json());

    expect(
      (
        await f
          .request(
            `${base}/${number}/KE1`,
            { message: text(p.randomBytes(4097)) },
            { method: "PUT", who: f.joiner },
          )
          .send()
      ).status,
    ).toBe(400);
  } finally {
    f.close();
  }
});

test("a conflicting filled slot closes even when the replacement has invalid OPAQUE length", async () => {
  const f = fixture(await identity());

  try {
    f.fresh();
    const opened = await f.request(base, {}).send();
    const { number } = p.MailboxOpenedSchema.parse(await opened.json());
    const path = `${base}/${number}/KE1`;
    const options = { method: "PUT", who: f.joiner };

    expect(
      (await f.request(path, { message: text(p.randomBytes(96)) }, options).send()).status,
    ).toBe(200);

    expect((await f.request(path, { message: "AA" }, options).send()).status).toBe(409);
    expect((await f.request(path).send()).status).toBe(404);
  } finally {
    f.close();
  }
});
