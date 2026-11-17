import type { createRequests } from "./request.ts";

export interface ICase {
  name: string;
  request: string;
  // Methods of pipelined requests, in order; one entry for a single request.
  methods: string[];
  // Reference status a case must reach to exercise its branch.
  status?: number;
  stalled?: boolean;
  empty400?: boolean;
}

const server = (line: string, headers = "", body = "") =>
  `${line} HTTP/1.1\r\nHost: server\r\n${headers}\r\n${body}`;

const closing = (line: string, headers = "") =>
  `${line} HTTP/1.1\r\nHost: localhost\r\n${headers}Connection: close\r\n\r\n`;

const challenge = "A".repeat(43);

function single(name: string, request: string, status?: number): ICase {
  return { name, request, methods: [request.split(" ")[0]!], ...(status ? { status } : {}) };
}

// From the Go port's live network test against the Bun server.
const go: ICase[] = [
  single("go HEAD /", server("HEAD /")),
  single("go HEAD /v1/head", server("HEAD /v1/head")),
  single(
    "go 413 with request header",
    server("POST /v1/swap", "Content-Length: 33554433\r\nEnvden-Request: !\r\n"),
  ),
  single(
    "go duplicate equal Content-Length",
    server("POST /v1/vault", "Content-Length: 1\r\nContent-Length: 1\r\n", "x"),
  ),
  single("go dot segments", server("GET /v1/../v1/status")),
  single("go GET /", server("GET /")),
  single("go GET /v1/status", server("GET /v1/status")),
  single("go GET /missing", server("GET /missing")),
  single("go POST /missing", server("POST /missing", "Content-Length: 1\r\n", "x")),
  single("go POST /v1/status", server("POST /v1/status", "Content-Length: 1\r\n", "x")),
  single("go GET with body", server("GET /v1/status", "Content-Length: 1\r\n", "x")),
  single("go GET hello", server(`GET /v1/hello?challenge=${challenge}`)),
  single("go HEAD hello", server(`HEAD /v1/hello?challenge=${challenge}`)),
  single("go GET /v1/head unsigned", server("GET /v1/head")),
  single("go unknown v1 route", server("GET /v1/not-a-route")),
  single(
    "go PUT /v1/vault",
    server("PUT /v1/vault", "Envden-Request: !\r\nContent-Length: 1\r\n", "x"),
  ),
  single(
    "go POST /v1/vault malformed",
    server("POST /v1/vault", "Envden-Request: !\r\nContent-Length: 1\r\n", "x"),
  ),
  single("go OPTIONS", server("OPTIONS /v1/status")),
  single("go Content-Length abc", server("POST /v1/vault", "Content-Length: abc\r\n")),
  single("go Content-Length -1", server("POST /v1/vault", "Content-Length: -1\r\n")),
  single(
    "go conflicting Content-Length",
    server("POST /v1/vault", "Content-Length: 1\r\nContent-Length: 2\r\n", "xx"),
  ),
];

// Declared one-byte bodies that never arrive; the server must answer and close.
const stalled: ICase[] = [
  "POST /missing",
  "POST /v1/vault",
  "GET /v1/status",
  "HEAD /v1/status",
].map((line) => ({
  ...single(`stalled ${line}`, server(line, "Content-Length: 1\r\n")),
  stalled: true,
}));

// From the Rust port's raw transport comparison.
function rust(signed: ReturnType<typeof createRequests>): ICase[] {
  const missingApprover = signed("/v1/pairing/approver");
  const replay = signed("/v1/opaque/registration/start", "{");
  const hello = `GET /v1/hello?challenge=${Buffer.alloc(32).toString("base64url")}`;
  const notFound = closing("GET /missing");
  const tooLarge = closing("POST /v1/swap", "Content-Length: 33554433\r\n");
  const open = "GET /missing HTTP/1.1\r\nHost: localhost\r\n\r\n";

  return [
    single("rust signed hello", closing(hello), 200),
    single("rust HEAD status page", closing("HEAD /")),
    single("rust HEAD status JSON", closing("HEAD /v1/status")),
    single("rust HEAD hello", closing("HEAD /v1/hello")),
    single("rust 404", notFound, 404),
    single("rust DELETE dispatch", closing("DELETE /v1/hello"), 404),
    single("rust 413", tooLarge, 413),
    single("rust status headers", closing("GET /v1/status"), 200),
    single(
      "rust unknown vault before malformed proof",
      signed("/v1/head").replace(/Envden-Proof: [^\r\n]+/, "Envden-Proof: !"),
      404,
    ),
    single("rust missing approver first", missingApprover, 404),
    single("rust missing approver retry", missingApprover, 404),
    single("rust bad signature", signed("/v1/pairing/approver", "", "1.0.0", true), 401),
    single("rust replay first", replay, 400),
    single("rust replay second", replay, 401),
    single("rust 426", signed("/v1/pairing/approver", "", "0.0.0"), 426),
    single("rust malformed JSON", signed("/v1/opaque/registration/start", "{"), 400),
    {
      name: "rust persistent HEAD",
      request: open + "HEAD /v1/status HTTP/1.1\r\nHost: localhost\r\n\r\n" + notFound,
      methods: ["GET", "HEAD", "GET"],
    },
    { name: "rust persistent 413", request: open + tooLarge, methods: ["GET", "POST"] },
  ];
}

export function transportCases(signed: ReturnType<typeof createRequests>): ICase[] {
  return [...go, ...rust(signed), ...stalled].map((item) => ({
    ...item,
    ...(["go Content-Length abc", "go Content-Length -1", "go conflicting Content-Length"].includes(
      item.name,
    )
      ? { empty400: true, status: 400 }
      : {}),
  }));
}
