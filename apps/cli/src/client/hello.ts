import { milliseconds } from "date-fns";
import { serverFetch } from "./fetch.ts";
import type { TFetch } from "./fetch.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { binary, text } from "./encoding.ts";
import { MIN_SERVER } from "../version.ts";
import { decodeUntrusted } from "./untrusted.ts";

export async function hello(
  address: string,
  pin: Uint8Array | undefined,
  fetcher: TFetch,
  minServer = MIN_SERVER,
) {
  const url = new URL("/v1/hello", address);
  const challenge = p.randomBytes(32);
  url.searchParams.set("challenge", text(challenge));

  const response = await serverFetch(fetcher, url, {
    signal: AbortSignal.timeout(milliseconds({ seconds: 2 })),
    redirect: "error",
  });

  if (!response.ok) throw new EnvdenError("UNAUTHORIZED", "Server hello failed");
  let body;

  try {
    body = p.HelloResponseSchema.parse(await response.json());
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid data from server", { cause });
  }

  const signed = decodeUntrusted(p.signedCodec(p.ServerHelloCodec), binary(body.hello));
  const presented = p.serverPin(signed.body.serverSignPub);
  const result = p.verifyHello(signed, challenge, url.hostname, pin ?? presented, "0.0.0");
  if (!result.ok) throw new EnvdenError("UNAUTHORIZED", "Server identity verification failed");

  if (p.compareSemver(result.value.appVersion, minServer) < 0)
    throw new EnvdenError("SERVER_TOO_OLD", "Update the server");

  if (!result.value.protocols.includes(1))
    throw new EnvdenError("UPDATE_REQUIRED", "No compatible protocol");

  return { pin: presented, hello: result.value };
}

const servers = new WeakMap<TFetch, Map<string, ReturnType<typeof hello>>>();

export function memberHello(address: string, pin: Uint8Array, fetcher: TFetch) {
  let cache = servers.get(fetcher);

  if (!cache) {
    cache = new Map();
    servers.set(fetcher, cache);
  }

  const key = `${new URL(address).origin}/${text(pin)}`;
  let pending = cache.get(key);

  if (!pending) {
    pending = hello(address, pin, fetcher).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });

    cache.set(key, pending);
  }

  return pending;
}
