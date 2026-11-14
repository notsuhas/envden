import { expect, test } from "bun:test";
import { readBody } from "../middleware/body.ts";

for (const path of ["/v1/opaque/login/start", "/v1/pairing/mailboxes", "/v1/vault"])
  test(`stream cap cancels oversized ${path}`, async () => {
    let cancelled = false;

    let sent = false;

    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (sent) controller.close();
          else {
            sent = true;
            controller.enqueue(new Uint8Array(65537));
          }
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );

    expect(
      readBody(new Request(`http://server${path}`, { method: "POST", body: stream })),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(cancelled).toBe(true);
  });

test("content length is checked before reading", async () => {
  const request = new Request("http://server/v1/opaque/login/start", {
    method: "POST",
    headers: { "Content-Length": "65537" },
    body: "small",
  });

  expect(readBody(request)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(request.bodyUsed).toBe(false);
});

test("blob endpoints allow bodies larger than the auth cap", async () => {
  const body = new Uint8Array(65537);

  expect(
    await readBody(new Request("http://server/v1/blobs/hash", { method: "PUT", body })),
  ).toEqual(body);
});

test("trickling cannot reset the absolute body deadline and cancels the reader", async () => {
  let expire = () => {};
  let cancelled = false;
  let stopped = false;
  let signal = () => {};

  const reading = new Promise<void>((resolve) => {
    signal = resolve;
  });

  let pulls = 0;

  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (pulls++ === 0) controller.enqueue(new Uint8Array([1]));
        else signal();
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );

  const result = readBody(
    new Request("http://server/v1/swap", { method: "POST", body: stream }),
    65536,
    undefined,
    (callback) => {
      expire = callback;

      return () => {
        stopped = true;
      };
    },
  );

  let settled = false;

  void result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  await reading;
  expire();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(settled).toBe(true);
  await Promise.resolve(expect(result).rejects.toMatchObject({ code: "INVALID_INPUT" }));
  expect(cancelled).toBe(true);
  expect(stopped).toBe(true);
});

test("read routes reject bodies even when the final segment looks like an upload route", async () => {
  const { bodyLimit } = await import("../middleware/body.ts");

  expect(() =>
    bodyLimit(new Request("http://server/v1/files/vault", { method: "POST", body: "x" })),
  ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));

  expect(() =>
    bodyLimit(new Request("http://server/v1/head", { headers: { "Content-Length": "1" } })),
  ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
});

test("public hello rejects a declared read body", async () => {
  const { fixture, identity } = await import("./fixture.ts");
  const f = fixture(await identity());

  try {
    const response = await f.app.request("/v1/hello", { headers: { "Content-Length": "1" } });
    expect(response.status).toBe(400);
  } finally {
    f.close();
  }
});

for (const [length, expected] of [
  [0, 10000],
  [16777216, 10000],
  [33554432, 10000],
] as const)
  test(`body deadline scales for ${length} bytes`, async () => {
    let deadline = 0;

    await readBody(
      new Request("http://server/v1/swap", {
        method: "POST",
        headers: { "Content-Length": String(length) },
        body: new Uint8Array(),
      }),
      33554432,
      undefined,
      (_callback, timeout) => {
        deadline = timeout;

        return () => {};
      },
      () => 0,
    );

    expect(deadline).toBe(expected);
  });

test("repair accepts the maximum report list", async () => {
  const bytes = new Uint8Array(182 + 32 * 100000);

  expect(
    (await readBody(new Request("http://server/v1/repair/report", { method: "PUT", body: bytes })))
      .length,
  ).toBe(bytes.length);
});

test("declared body length is enforced while streaming", () => {
  expect(
    readBody(
      new Request("http://server/v1/swap", {
        method: "POST",
        headers: { "Content-Length": "1" },
        body: new Uint8Array(2),
      }),
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("only received bytes extend the body deadline", async () => {
  const deadlines: number[] = [];

  await readBody(
    new Request("http://server/v1/swap", {
      method: "POST",
      headers: { "Content-Length": "33554432" },
      body: new Uint8Array(65536),
    }),
    33554432,
    undefined,
    (_expire, timeout) => {
      deadlines.push(timeout);

      return () => {};
    },
    () => 0,
  );

  expect(deadlines[0]).toBe(10000);
  expect(deadlines.at(-1)).toBe(12000);
  expect(Math.max(...deadlines)).toBe(12000);
});
