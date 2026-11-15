import { strict as assert } from "node:assert";
import { connect } from "node:net";
import { mkdtemp, mkdir, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as p from "@envden/core/protocol";

const root = resolve(import.meta.dir, "../..");
const tsCommand = [join(root, "apps/cli/dist/envden"), "serve"];
const rustCommand = [join(root, "target/server/release/envden-serve")];

async function start(command: string[], data: string, token?: string) {
  const child = Bun.spawn(
    [...command, "--data-dir", data, "--port", "0", "--min-client", "1.0.0"],
    {
      env: {
        ...process.env,
        HOME: join(data, "home"),
        USERPROFILE: join(data, "home"),
        ENVDEN_HOME: join(data, "client"),
        XDG_CONFIG_HOME: join(data, "config"),
        ENVDEN_SETUP_TOKEN: token ?? "",
        ENVDEN_NO_UPDATE_CHECK: "1",
        ENVDEN_TELEMETRY: "0",
        ENVDEN_NO_REPORT: "1",
        ENVDEN_STATUS_PAGE: "off",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const port = await listening(child);
  await raw(port, "GET /missing HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");

  return { child, port };
}

async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  let output = "";
  const reader = child.stdout.getReader();

  for (;;) {
    const { value, done } = await reader.read();

    if (done)
      throw new Error(`server exited before listening: ${await new Response(child.stderr).text()}`);

    output += new TextDecoder().decode(value);
    const address = /listening on (http:\/\/[^\s]+)/.exec(output)?.[1];

    if (address) {
      reader.releaseLock();

      return Number(new URL(address).port);
    }
  }
}

async function stop(server: Awaited<ReturnType<typeof start>>) {
  server.child.kill("SIGTERM");
  assert.equal(await server.child.exited, 0);
}

async function raw(port: number, request: string) {
  return new Promise<Buffer>((accept, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(port, "127.0.0.1", () => socket.write(request));
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("end", () => accept(Buffer.concat(chunks)));
    socket.on("error", reject);
    socket.setTimeout(10000, () => socket.destroy(new Error("transport request timed out")));
  });
}

export function comparable(bytes: Buffer) {
  const boundary = bytes.indexOf("\r\n\r\n");
  assert.ok(boundary >= 0, "complete HTTP response");
  const lines = bytes.subarray(0, boundary).toString().split("\r\n");
  const headers = lines.slice(1).filter((line) => !/^(date|connection|keep-alive):/i.test(line));

  return { status: lines[0], headers, body: bytes.subarray(boundary + 4).toString("base64") };
}

async function runTransport() {
  const temporary = await mkdtemp(join(tmpdir(), "envden-transport-"));
  const data = join(temporary, "ts");
  const rustData = join(temporary, "rust");

  let ts: Awaited<ReturnType<typeof start>> | undefined;

  let rust: Awaited<ReturnType<typeof start>> | undefined;

  try {
    const seed = await start(tsCommand, data);
    await stop(seed);
    await mkdir(rustData);
    await copyFile(join(data, "identity.json"), join(rustData, "identity.json"));
    const identity = JSON.parse(await readFile(join(data, "identity.json"), "utf8"));
    const publicKey = Buffer.from(identity.publicKey, "base64url");
    const pin = p.serverPin(publicKey);
    const secret = p.randomBytes(20);
    const token = p.encodeToken("setup", secret, pin);
    ts = await start(tsCommand, data, token);
    rust = await start(rustCommand, rustData, token);
    const keys = p.generateDeviceKeys();

    const device = {
      id: p.deviceId(keys),
      name: "transport",
      encPub: keys.encPub,
      objPub: keys.objPub,
      reqPub: keys.reqPub,
    };

    function signed(path: string, body = "", version = "1.0.0", bad = false) {
      const method = body ? "POST" : "GET";

      const r = {
        serverPin: pin,
        vaultId: new Uint8Array(32).fill(9),
        method,
        pathAndQuery: path,
        bodyHash: p.sha256(Buffer.from(body)),
        time: BigInt(Date.now()),
        nonce: p.randomBytes(16),
        device: device.id,
        clientVersion: version,
      };

      const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

      const headers = {
        Host: "localhost",
        Connection: "close",
        "Content-Length": Buffer.byteLength(body),
        "Envden-Request": encode(p.RequestCodec.write(r)),
        "Envden-Device": encode(r.device),
        "Envden-Time": String(r.time),
        "Envden-Nonce": encode(r.nonce),
        "Envden-Body-Hash": encode(r.bodyHash),
        "Envden-Signature": encode(
          bad ? new Uint8Array(64) : p.signRequest(r, keys.reqSk).signature,
        ),
        "Envden-Device-Record": encode(p.DeviceRecordCodec.write(device)),
        "Envden-Proof": encode(p.tokenProof("setup", p.tokenKey("setup", secret), r)),
      };

      return `${method} ${path} HTTP/1.1\r\n${Object.entries(headers)
        .map(([name, value]) => `${name}: ${value}`)
        .join("\r\n")}\r\n\r\n${body}`;
    }

    const missingApprover = signed("/v1/pairing/approver");
    const replay = signed("/v1/opaque/registration/start", "{");

    const cases = [
      ["HEAD status page", "HEAD / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n", 404],
      [
        "HEAD status JSON",
        "HEAD /v1/status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        404,
      ],
      [
        "HEAD hello",
        "HEAD /v1/hello HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        404,
      ],
      ["404", "GET /missing HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n", 404],
      [
        "405 method dispatch",
        "DELETE /v1/hello HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        404,
      ],
      [
        "413",
        "POST /v1/swap HTTP/1.1\r\nHost: localhost\r\nContent-Length: 33554433\r\nConnection: close\r\n\r\n",
        413,
      ],
      [
        "status headers",
        "GET /v1/status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        404,
      ],
      ["missing approver first", missingApprover, 404],
      ["missing approver retry", missingApprover, 404],
      ["bad signature", signed("/v1/pairing/approver", "", "1.0.0", true), 401],
      ["replay first", replay, 400],
      ["replay second", replay, 401],
      ["426", signed("/v1/pairing/approver", "", "0.0.0"), 426],
      ["malformed JSON", signed("/v1/opaque/registration/start", "{"), 400],
    ] satisfies [string, string, number][];

    for (const [name, request, status] of cases) {
      const expected = comparable(await raw(ts.port, request));
      const actual = comparable(await raw(rust.port, request));
      assert.ok(expected.status?.startsWith(`HTTP/1.1 ${status} `), name);
      assert.deepEqual(actual, expected, name);
      console.log(`PASS ${name}`);
    }

    console.log(`${cases.length}/${cases.length} raw transport cases passed`);
  } finally {
    if (ts) await stop(ts);
    if (rust) await stop(rust);
    await rm(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) await runTransport();
