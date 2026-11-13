import type { TFetch } from "../fetch.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { deviceIdentity } from "../../identity/device.ts";
import { createClient } from "../request.ts";
import { hello } from "../hello.ts";
import { text, binary } from "../encoding.ts";

const homes: string[] = [];

afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "envden-request-"));
  homes.push(home);
  const server = p.generateRecoveryKeys();

  const identity = await deviceIdentity(
    createMemoryKeychainAdapter(["get", "set"]),
    home,
    "device",
  );

  const pin = p.serverPin(server.objPub);

  const options = {
    address: "https://server.example",
    vaultId: new Uint8Array(32),
    pin,
    identity,
    version: "1.0.0",
    now: () => 1000000,
  };

  return { server, options };
}

test("request signs the exact body, query and pin; locked retries once", async () => {
  const { options } = await fixture();
  let attempts = 0;
  let unlocked = 0;

  const client = createClient({
    ...options,
    unlock: async () => {
      unlocked++;
    },
    fetcher: async (url, init) => {
      attempts++;
      const headers = new Headers(init?.headers);
      const request = p.decode(p.RequestCodec, binary(headers.get("Envden-Request")!));
      expect(binary(headers.get("Envden-Body-Hash")!)).toEqual(request.bodyHash);
      expect(request.pathAndQuery).toBe("/v1/test?q=1");

      expect(
        p.verifyRequest(
          { body: request, signature: binary(headers.get("Envden-Signature")!) },
          options.identity.record.reqPub,
          options.pin,
          new TextEncoder().encode(typeof init?.body === "string" ? init.body : ""),
          1000000n,
          false,
        ).ok,
      ).toBe(true);

      expect(url instanceof Request ? url.url : url.toString()).toContain("server.example");

      return attempts === 1
        ? Response.json({ error: "LOCKED" }, { status: 403 })
        : Response.json({ kind: "ok" });
    },
  });

  await client.request("/v1/test?q=1", "POST", { message: "test" });
  expect(unlocked).toBe(1);
  expect(attempts).toBe(2);

  expect(client.request("https://other.example/", "GET")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});

test("426 trusts the fresh signed hello, never the unsigned minimum", async () => {
  const { options, server } = await fixture();

  const fetcher: TFetch = async (url) => {
    const address = new URL(url instanceof Request ? url.url : url.toString());

    if (address.pathname !== "/v1/hello")
      return Response.json({ minClient: "99.0.0" }, { status: 426 });

    const signed = p.buildHello(
      {
        challenge: binary(address.searchParams.get("challenge")!),
        host: address.hostname,
        serverSignPub: server.objPub,
        appVersion: "1.0.0",
        minClient: "2.0.0",
        protocols: [1],
      },
      server.objSk,
    );

    return Response.json({ hello: text(p.signedCodec(p.ServerHelloCodec).write(signed)) });
  };

  expect(createClient({ ...options, fetcher }).request("/v1/test")).rejects.toMatchObject({
    code: "CLIENT_TOO_OLD",
  });

  expect(hello(options.address, p.randomBytes(32), fetcher, "0.0.0")).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});

test("typed routes use the signed binary transport", async () => {
  const { options } = await fixture();
  const bytes = p.randomBytes(48);

  const client = createClient({
    ...options,
    fetcher: async (_input, init) => {
      const headers = new Headers(init?.headers);
      const value = p.decode(p.RequestCodec, binary(headers.get("Envden-Request")!));
      expect(value.pathAndQuery).toBe("/v1/swap");
      expect(p.equal(value.bodyHash, p.sha256(bytes))).toBe(true);
      expect(value.method).toBe("POST");

      return Response.json({ kind: "committed" });
    },
  });

  const response = await client.rpc.v1.swap.$post({}, { init: { body: new Uint8Array(bytes) } });
  expect(await response.json()).toEqual({ kind: "committed" });
});

test("transport failures become a fixed unreachable error without leaking raw text", async () => {
  const { serverFetch } = await import("../fetch.ts");

  const failure = serverFetch(async () => {
    throw new Error("secret server address");
  }, "https://server.invalid");

  await Promise.resolve(
    expect(failure).rejects.toMatchObject({
      code: "SERVER_UNREACHABLE",
      message: "Server unreachable; check the server address and your private network",
    }),
  );
});

test("wire errors use the shared code schema", async () => {
  const { responseError } = await import("../errors.ts");

  expect((await responseError(Response.json({ error: "SERVER_UNREACHABLE" }))).code).toBe(
    "SERVER_UNREACHABLE",
  );

  expect((await responseError(Response.json({ error: "MADE_UP" }))).code).toBe("INVALID_DATA");
});
