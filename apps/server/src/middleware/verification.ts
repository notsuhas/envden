import { readBody } from "./body.ts";
import { verifyAccess } from "./access/verify.ts";
import type { Context } from "hono";
import type { IRequest } from "@envden/core/protocol";
import { createMiddleware } from "hono/factory";
import { EnvdenError } from "@envden/core/errors";
import {
  decode,
  DeviceRecordCodec,
  equal,
  RequestCodec,
  serverPin,
  sha256,
  verifyRequest,
  compareSemver,
} from "@envden/core/protocol";
import { binary, input } from "../http/encoding.ts";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { membership } from "../vault/chain.ts";

export function verification(options: IAppOptions) {
  return createMiddleware<TServerEnv>(async (c, next) => {
    const { storage, now, config } = options;
    const raw = c.req.raw;
    const request = input(() => decode(RequestCodec, binary(c.req.header("Envden-Request"))));
    const signature = binary(c.req.header("Envden-Signature"), 64);
    const body = await readBody(raw);

    c.req.raw = new Request(raw.url, {
      method: raw.method,
      headers: raw.headers,
      ...(!["GET", "HEAD"].includes(raw.method) ? { body } : {}),
    });

    const url = new URL(raw.url);

    verifyBinding(c, request, body);

    const member = membership(storage, request.vaultId, request.device);

    const supplied =
      member ??
      input(() => decode(DeviceRecordCodec, binary(c.req.header("Envden-Device-Record"))));

    if (
      !equal(supplied.id, request.device) ||
      !verifyRequest(
        { body: request, signature },
        supplied.reqPub,
        serverPin(options.serverKeys.publicKey),
        body,
        BigInt(now()),
        false,
      ).ok
    )
      throw new EnvdenError("UNAUTHORIZED", "Invalid request");

    if (!storage.rememberNonce(request.device, request.nonce, now()))
      throw new EnvdenError("UNAUTHORIZED", "Replayed request");

    if (compareSemver(request.clientVersion, config.minClient) < 0)
      throw new EnvdenError("CLIENT_TOO_OLD", "Update required");

    verifyAccess(c, options, request, !!member, url.pathname);

    await next();
  });
}

function verifyBinding(c: Context<TServerEnv>, request: IRequest, body: Uint8Array) {
  const raw = c.req.raw;
  const url = new URL(raw.url);

  if (
    !equal(request.device, binary(c.req.header("Envden-Device"), 16)) ||
    String(request.time) !== c.req.header("Envden-Time") ||
    !equal(request.nonce, binary(c.req.header("Envden-Nonce"), 16)) ||
    request.method !== raw.method ||
    request.pathAndQuery !== url.pathname + url.search ||
    !equal(request.bodyHash, sha256(body))
  )
    throw new EnvdenError("UNAUTHORIZED", "Request binding mismatch");
}
