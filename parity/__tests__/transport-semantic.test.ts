import { headLengths } from "../transport/compare.ts";
import { observationsEqual } from "../transport/semantic.ts";

import { expect, test } from "bun:test";
import { semanticObservation, type IObservation } from "../transport/semantic.ts";
import { comparable } from "../transport/wire.ts";
import type { ICase } from "../transport/cases.ts";

const item: ICase = { name: "HEAD", request: "HEAD /", methods: ["HEAD"] };

const observation = (headers: string[], body = "", status = "HTTP/1.1 200 OK"): IObservation => ({
  responses: [{ headers, body, status }],
  closed: true,
});

const normalize = (value: IObservation, c = item) =>
  semanticObservation(c, value, new Map([[0, 17]]));

test("correctness ignores header name case/order and permits zero or GET length for HEAD", () => {
  const a = observation([
    "Content-Length: 0",
    "X-Frame-Options: DENY",
    "Set-Cookie: a",
    "Set-Cookie: b",
  ]);

  const b = observation([
    "set-cookie: b",
    "x-frame-options: DENY",
    "content-length: 17",
    "set-cookie: a",
  ]);

  expect(normalize(a)).toEqual(normalize(b));

  expect(comparable(Buffer.from("HTTP/1.1 200 OK\r\nX-A: b\r\n\r\n"))).not.toEqual(
    comparable(Buffer.from("HTTP/1.1 200 OK\r\nx-a: b\r\n\r\n")),
  );
});

test("HEAD exceptions preserve body, security contents, status, closure and duplicate multiplicity", () => {
  const a = observation([
    "Content-Length: 0",
    "X-Frame-Options: DENY",
    "Set-Cookie: a",
    "Set-Cookie: b",
  ]);

  const changes = [
    { ...a, closed: false },
    observation(a.responses[0]!.headers, "wrong"),
    observation(a.responses[0]!.headers, "", "HTTP/1.1 401 Unauthorized"),
    observation(["Content-Length: 999", "X-Frame-Options: DENY", "Set-Cookie: a", "Set-Cookie: b"]),
    observation([
      "Content-Length: 0",
      "X-Frame-Options: SAMEORIGIN",
      "Set-Cookie: a",
      "Set-Cookie: b",
    ]),
    observation([...a.responses[0]!.headers, "Set-Cookie: a"]),
    observation(["Content-Length: 0", "X-Frame-Options: DENY", "Set-Cookie: a", "Set-Cookie: a"]),
  ];

  for (const changed of changes) expect(normalize(changed)).not.toEqual(normalize(a));
});

test("only designated empty malformed-length 400 responses permit absent versus zero framing", () => {
  const c = { ...item, methods: ["POST"], empty400: true };
  const empty = observation([], "", "HTTP/1.1 400 Bad Request");
  const zero = observation(["Content-Length: 0"], "", "HTTP/1.1 400 Bad Request");
  expect(normalize(empty, c)).toEqual(normalize(zero, c));

  expect(normalize(empty, { ...c, empty400: false })).not.toEqual(
    normalize(zero, { ...c, empty400: false }),
  );

  for (const headers of [["Content-Length: 4"], ["Content-Length: 0", "Content-Length: 0"]])
    expect(normalize(observation(headers, "", empty.responses[0]!.status), c)).not.toEqual(
      normalize(empty, c),
    );

  expect(normalize({ ...zero, closed: false }, c)).not.toEqual(normalize(empty, c));

  expect(
    normalize(observation(["Content-Length: 0"], "bad", empty.responses[0]!.status), c),
  ).not.toEqual(normalize(empty, c));
});

test("HEAD comparison measures each runtime's corresponding GET length", async () => {
  const servers = ["123", "12345"].map((body) =>
    Bun.serve({
      port: 0,
      fetch: () => new Response(body, { headers: { "Content-Length": String(body.length) } }),
    }),
  );

  try {
    const lengths = await headLengths(
      { ...item, request: "HEAD / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n" },
      servers.map((s) => s.port!),
    );

    expect(lengths.map((m) => m.get(0))).toEqual([3, 5]);

    const observed: [IObservation, IObservation] = [
      observation(["Content-Length: 3"]),
      observation(["Content-Length: 5"]),
    ];

    expect(observationsEqual(item, observed, false, lengths)).toBe(true);
    expect(observationsEqual(item, observed, true, lengths)).toBe(false);
  } finally {
    for (const server of servers) await server.stop(true);
  }
});

test("equal invalid lengths cannot pass the correctness gate", () => {
  for (const headers of [["Content-Length: 999"], ["Content-Length: 0", "Content-Length: 0"], []]) {
    const wrong = observation(headers);

    expect(
      observationsEqual(item, [wrong, wrong], false, [new Map([[0, 17]]), new Map([[0, 17]])]),
    ).toBe(false);
  }

  const malformed = { ...item, methods: ["POST"], empty400: true };
  const wrong = observation(["Content-Length: 9"], "", "HTTP/1.1 400 Bad Request");
  expect(observationsEqual(malformed, [wrong, wrong], false, [])).toBe(false);
});
