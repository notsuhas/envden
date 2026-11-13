import { expect, test } from "bun:test";
import { vaultId, fixture, identity, candidate } from "./fixture.ts";
import { reserveBody } from "../middleware/body-budget.ts";

type TFixture = ReturnType<typeof fixture>;

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
  const f = fixture(await identity());
  f.fresh();
  const requests = [hold(f, "/v1/files/vault"), hold(f, "/v1/files/vault")];

  try {
    expect(await Promise.all(requests.map(async (r) => (await r.response).status))).toEqual([
      404, 404,
    ]);

    const release = reserveBody(134217728);
    release();
    expect((await f.request("/v1/devices").send()).status).toBe(200);
  } finally {
    f.close();
  }
});

test("public login flood is bounded before reading and cannot consume member capacity", async () => {
  const fixtures = await Promise.all(
    Array.from({ length: 9 }, async () => fixture(await identity())),
  );

  const held = fixtures.slice(0, 8).map((f) => hold(f, "/v1/opaque/login/start"));
  const f = fixtures[8]!;

  try {
    await Promise.all(held.map((r) => r.reading));
    const response = await f.request("/v1/opaque/login/start", {}, { who: f.joiner }).send();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "BUSY" });
    f.fresh();

    expect(
      (await f.request("/v1/settings/unlock-period", { period: null }, { method: "PUT" }).send())
        .status,
    ).toBe(200);
  } finally {
    held.forEach((r) => r.finish());
    await Promise.all(held.map((r) => Promise.resolve(r.response)));
    fixtures.forEach((item) => item.close());
  }
});

test("public login starts are charged before reading the body", async () => {
  const f = fixture(await identity());
  const held = Array.from({ length: 5 }, () => hold(f, "/v1/opaque/login/start", candidate()));

  try {
    await Promise.all(held.map((r) => r.reading));
    const response = await f.request("/v1/opaque/login/start", {}, { who: candidate() }).send();
    expect(response.status).toBe(429);
  } finally {
    held.forEach((r) => r.finish());
    await Promise.all(held.map((r) => Promise.resolve(r.response)));
    f.close();
  }
});

test("bodiless GETs reserve nothing even when both body budgets are full", async () => {
  const f = fixture(await identity());
  const member = reserveBody(134217728);
  const publicBody = reserveBody(1048576, "public");
  f.fresh();

  try {
    expect((await f.request("/v1/devices").send()).status).toBe(200);

    expect(
      (await f.request("/v1/pairing/approver", undefined, { who: f.joiner }).send()).status,
    ).not.toBe(503);
  } finally {
    member();
    publicBody();
    f.close();
  }
});

test("two stalled ticket-authorized non-members cannot block members", async () => {
  const f = fixture(await identity());
  f.fresh();

  f.storage.putSession(
    vaultId,
    { kind: "join-ticket", device: f.joiner.record.id, purpose: "kit" },
    new Uint8Array([1]),
    f.options.now(),
  );

  const held = [hold(f, "/v1/swap"), hold(f, "/v1/swap")];

  try {
    await Promise.all(held.map((r) => r.reading));
    expect((await f.request("/v1/swap", {}, { who: f.joiner }).send()).status).toBe(503);

    expect(
      (await f.request("/v1/settings/unlock-period", { period: null }, { method: "PUT" }).send())
        .status,
    ).toBe(200);
  } finally {
    held.forEach((r) => r.finish());
    await Promise.all(held.map((r) => Promise.resolve(r.response)));
    f.close();
  }
});
