import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture, identity } from "./fixture.ts";
import { text } from "../http/encoding.ts";
import { reserveBody } from "../middleware/body-budget.ts";

for (const failure of ["signature", "hash", "budget", "setup"] as const)
  test(`${failure} enforces request body authorization`, async () => {
    const f = fixture(await identity());
    f.fresh();
    let consumed = 0;

    const bytes =
      failure === "signature"
        ? new Uint8Array(1048576)
        : new TextEncoder().encode('{"period":null}');

    const path = failure === "setup" ? "/v1/vault" : "/v1/settings/unlock-period";

    const signed = f.request(
      path,
      { period: null },
      { method: failure === "setup" ? "POST" : "PUT" },
    ).r;

    if (failure === "setup") signed.vaultId = p.randomBytes(32);
    if (failure === "hash") signed.bodyHash = p.sha256(new Uint8Array());

    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          consumed += bytes.length;
          controller.enqueue(bytes);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );

    const release = failure === "budget" ? reserveBody(134217728) : () => {};

    try {
      const response = await f.app.request(`http://server${path}`, {
        method: signed.method,
        body: stream,
        headers: {
          "Envden-Request": text(p.RequestCodec.write(signed)),
          "Envden-Device": text(signed.device),
          "Envden-Time": String(signed.time),
          "Envden-Nonce": text(signed.nonce),
          "Envden-Body-Hash": text(signed.bodyHash),
          "Envden-Signature": text(
            failure === "signature"
              ? new Uint8Array(64)
              : p.signRequest(signed, f.member.keys.reqSk).signature,
          ),
          "Envden-Device-Record": text(p.DeviceRecordCodec.write(f.member.record)),
        },
      });

      const statuses = { signature: 401, hash: 401, budget: 503, setup: 401 };
      const consumedBytes = { signature: 0, hash: bytes.length, budget: 0, setup: 0 };

      expect(response.status).toBe(statuses[failure]);
      expect(consumed).toBe(consumedBytes[failure]);
    } finally {
      release();
      f.close();
    }
  });

test("concurrent body reservations return 503 and release after requests finish", async () => {
  const f = fixture(await identity());
  f.fresh();

  function hold() {
    let finish = () => {};
    let signal = () => {};

    const reading = new Promise<void>((resolve) => {
      signal = resolve;
    });

    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          signal();

          return new Promise<void>((resolve) => {
            finish = () => {
              controller.enqueue(new TextEncoder().encode("{}"));
              controller.close();
              resolve();
            };
          });
        },
      },
      { highWaterMark: 0 },
    );

    const { headers } = f.request("/v1/swap", {});
    const response = f.app.request("/v1/swap", { method: "POST", headers, body: stream });

    return { reading, response, finish: () => finish() };
  }

  const first = hold();
  await first.reading;
  const second = hold();

  try {
    expect((await second.response).status).toBe(503);
    const other = reserveBody(65536, "member", f.request("/v1/swap", {}, { who: f.joiner }).r);
    other();
    expect((await f.request("/v1/swap", {}).send()).status).toBe(503);
  } finally {
    first.finish();
    second.finish();
    await Promise.all([first.response, second.response]);

    try {
      expect(
        (await f.request("/v1/settings/unlock-period", { period: null }, { method: "PUT" }).send())
          .status,
      ).toBe(200);
    } finally {
      f.close();
    }
  }
});

test("membership revoked during body read cannot upload a blob", async () => {
  const { spyOn } = await import("bun:test");
  const f = fixture(await identity());
  f.fresh();
  const blob = p.randomBytes(32);
  const path = `/v1/blobs/${text(p.H("blob", blob))}`;

  const signed = f.request(path, undefined, {
    method: "PUT",
    mutate: (r) => {
      r.bodyHash = p.sha256(blob);
    },
  });

  const head = spyOn(f.storage, "head");

  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        head.mockReturnValue(undefined);
        controller.enqueue(blob);
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );

  try {
    const response = await f.app.request(path, {
      method: "PUT",
      headers: signed.headers,
      body: stream,
    });

    expect(response.status).toBe(403);
    expect(f.storage.hasBlob(signed.r.vaultId, p.H("blob", blob))).toBe(false);
  } finally {
    head.mockRestore();
    f.close();
  }
});
