import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { candidate, fixture, identity, vaultId } from "./fixture.ts";
import { text } from "../http/encoding.ts";

const path = "/v1/pairing/mailboxes";

async function open(f: ReturnType<typeof fixture>) {
  return p.MailboxOpenedSchema.parse(await (await f.request(path, {}).send()).json()).number;
}

test("rejected writers do not consume the bound mailbox budget", async () => {
  const f = fixture(await identity());

  try {
    f.fresh();
    const number = await open(f);
    const body = { message: text(p.randomBytes(96)) };
    const joiner = f.joiner;

    expect(
      (await f.request(`${path}/${number}/KE1`, body, { method: "PUT", who: joiner }).send())
        .status,
    ).toBe(200);

    for (let i = 0; i < 19; i++)
      expect(
        (await f.request(`${path}/${number}/KE1`, body, { method: "PUT", who: candidate() }).send())
          .status,
      ).toBe(401);

    expect(
      (await f.request(`${path}/${number}/KE1`, body, { method: "PUT", who: candidate() }).send())
        .status,
    ).toBe(401);

    expect(
      (await f.request(`${path}/${number}/KE1`, body, { method: "PUT", who: joiner }).send())
        .status,
    ).toBe(200);

    expect(f.storage.mailbox(vaultId, number, f.options.now())?.slots.KE1).toEqual(
      Buffer.from(body.message, "base64url"),
    );
  } finally {
    f.close();
  }
});

test("a new mailbox opening has a fresh aggregate bucket", async () => {
  const f = fixture(await identity());

  try {
    f.fresh();
    const number = await open(f);
    const body = { message: text(p.randomBytes(96)) };

    for (let i = 0; i < 20; i++)
      expect(
        (await f.request(`${path}/${number}/KE1`, body, { method: "PUT", who: f.joiner }).send())
          .status,
      ).toBe(200);

    expect(
      (await f.request(`${path}/${number}/KE1`, body, { method: "PUT", who: f.joiner }).send())
        .status,
    ).toBe(429);

    await f.request(`${path}/${number}`, undefined, { method: "DELETE" }).send();
    f.advance(1);
    expect(await open(f)).toBe(number);

    expect(
      (await f.request(`${path}/${number}/KE1`, body, { method: "PUT", who: candidate() }).send())
        .status,
    ).toBe(200);
  } finally {
    f.close();
  }
});
