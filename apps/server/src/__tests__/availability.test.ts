import { createBodyBudget } from "../middleware/body-budget.ts";
import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultId, fixture, identity } from "./fixture.ts";
import { text } from "../http/encoding.ts";

type TFixture = ReturnType<typeof fixture>;

// A member write that needs only a body and membership, so its status shows member capacity.
function memberWrite(f: TFixture) {
  const hash = p.H("blob", new TextEncoder().encode(JSON.stringify("member")));

  return f.request(`/v1/blobs/${text(hash)}`, "member", { method: "PUT" }).send();
}

function hold(f: TFixture, path: string, who = f.joiner) {
  let finish = () => {};
  let signal = () => {};

  const reading = new Promise<void>((resolve) => {
    signal = resolve;
  });

  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        signal();

        finish = () => {
          controller.enqueue(new TextEncoder().encode("{}"));
          controller.close();
        };
      },
    },
    { highWaterMark: 0 },
  );

  const { headers } = f.request(path, {}, { who });
  const response = f.app.request(path, { method: "POST", headers, body: stream });

  return { reading, response, finish: () => finish() };
}

test("two invalid non-member routes never read or reserve and members remain available", async () => {
  const f = fixture(identity());
  const requests = [hold(f, "/v1/files/vault"), hold(f, "/v1/files/vault")];

  try {
    expect(await Promise.all(requests.map(async (r) => (await r.response).status))).toEqual([
      404, 404,
    ]);

    const release = f.reserveBody(134217728);
    release();
    expect((await f.request("/v1/devices").send()).status).toBe(200);
  } finally {
    f.close();
  }
});

test("public recovery flood is bounded before reading and cannot consume member capacity", async () => {
  const budget = createBodyBudget();
  const fixtures = Array.from({ length: 9 }, () => fixture(identity(), budget));
  const held = fixtures.slice(0, 8).map((f) => hold(f, "/v1/recovery/ticket"));
  const f = fixtures[8]!;

  try {
    await Promise.all(held.map((r) => r.reading));
    const response = await f.request("/v1/recovery/ticket", {}, { who: f.joiner }).send();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "BUSY" });
    expect((await memberWrite(f)).status).toBe(200);
  } finally {
    held.forEach((r) => r.finish());
    await Promise.all(held.map((r) => Promise.resolve(r.response)));
    fixtures.forEach((item) => item.close());
  }
});

test("bodiless GETs reserve nothing even when both body budgets are full", async () => {
  const f = fixture(identity());
  const member = f.reserveBody(134217728);
  const publicBody = f.reserveBody(1048576, "public");

  try {
    expect((await f.request("/v1/devices").send()).status).toBe(200);

    expect(
      (await f.request("/v1/join-requests/approved", undefined, { who: f.joiner }).send()).status,
    ).not.toBe(503);
  } finally {
    member();
    publicBody();
    f.close();
  }
});

test("two stalled ticket-authorized non-members cannot block members", async () => {
  const f = fixture(identity());

  f.storage.putSession(
    vaultId,
    { kind: "join-ticket", device: f.joiner.record.id, purpose: "recovery" },
    new Uint8Array([1]),
    f.options.now(),
  );

  const held = [hold(f, "/v1/swap"), hold(f, "/v1/swap")];

  try {
    await Promise.all(held.map((r) => r.reading));
    expect((await f.request("/v1/swap", {}, { who: f.joiner }).send()).status).toBe(503);

    expect((await memberWrite(f)).status).toBe(200);
  } finally {
    held.forEach((r) => r.finish());
    await Promise.all(held.map((r) => Promise.resolve(r.response)));
    f.close();
  }
});
