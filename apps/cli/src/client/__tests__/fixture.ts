import type { TFetch } from "../fetch.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "bun:test";
import * as p from "@envden/core/protocol";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { deviceIdentity } from "../../identity/device.ts";
import { text, binary } from "../encoding.ts";

const homes: string[] = [];

afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});

export async function fixture() {
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

  const greeting = (input: Parameters<TFetch>[0]) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname !== "/v1/hello") return;

    const signed = p.buildHello(
      {
        challenge: binary(url.searchParams.get("challenge")!),
        host: url.hostname,
        serverSignPub: server.objPub,
        appVersion: "1.0.0",
        minClient: "0.0.0",
        protocols: [1],
      },
      server.objSk,
    );

    return Response.json({ hello: text(p.signedCodec(p.ServerHelloCodec).write(signed)) });
  };

  return { server, options, greeting };
}
