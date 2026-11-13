import { serverFetch } from "./fetch.ts";
import type { TFetch } from "./fetch.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { binary, text } from "./encoding.ts";
import { VERSION } from "../version.ts";

export async function hello(
  address: string,
  pin: Uint8Array | undefined,
  fetcher: TFetch,
  minServer: string,
) {
  const url = new URL("/v1/hello", address);
  const challenge = p.randomBytes(32);
  url.searchParams.set("challenge", text(challenge));

  const response = await serverFetch(fetcher, url, {
    signal: AbortSignal.timeout(2000),
    redirect: "error",
  });

  if (!response.ok) throw new EnvdenError("UNAUTHORIZED", "Server hello failed");
  const body = p.HelloResponseSchema.parse(await response.json());
  const signed = p.decode(p.signedCodec(p.ServerHelloCodec), binary(body.hello));
  const presented = p.serverPin(signed.body.serverSignPub);
  const result = p.verifyHello(signed, challenge, url.hostname, pin ?? presented, VERSION);
  if (!result.ok) throw new EnvdenError("UNAUTHORIZED", "Server identity verification failed");

  if (p.compareSemver(result.value.appVersion, minServer) < 0)
    throw new EnvdenError("SERVER_TOO_OLD", "Update the server");

  if (!result.value.protocols.includes(1))
    throw new EnvdenError("UPDATE_REQUIRED", "No compatible protocol");

  return { pin: presented, hello: result.value };
}
