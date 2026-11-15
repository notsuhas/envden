import { strict as assert } from "node:assert";
import { connect } from "node:net";
import { mkdtemp, mkdir, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as p from "@envden/core/protocol";
import { createRequests } from "./transport/request.ts";
import { comparable, comparableMany } from "./transport/wire.ts";

export { comparable } from "./transport/wire.ts";

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

    const signed = createRequests({ pin, secret, keys });
    const missingApprover = signed("/v1/pairing/approver");
    const replay = signed("/v1/opaque/registration/start", "{");

    const cases = [
      [
        "signed hello",
        `GET /v1/hello?challenge=${Buffer.alloc(32).toString("base64url")} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`,
        200,
      ],
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

    const first = "GET /missing HTTP/1.1\r\nHost: localhost\r\n\r\n";

    const persistent = [
      [
        "persistent HEAD",
        first +
          "HEAD /v1/status HTTP/1.1\r\nHost: localhost\r\n\r\n" +
          cases.find(([name]) => name === "404")![1],
      ],
      ["persistent 413", first + cases.find(([name]) => name === "413")![1]],
    ] satisfies [string, string][];

    for (const [name, request] of persistent) {
      const expected = comparableMany(await raw(ts.port, request));
      const actual = comparableMany(await raw(rust.port, request));
      assert.deepEqual(actual, expected, name);
      console.log(`PASS ${name}`);
    }

    console.log(
      `${cases.length + persistent.length}/${cases.length + persistent.length} raw transport cases passed`,
    );
  } finally {
    if (ts) await stop(ts);
    if (rust) await stop(rust);
    await rm(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) await runTransport();
