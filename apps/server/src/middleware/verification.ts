import { requestRoute } from "../routes/policy.ts";
import { verifiedBody } from "./access/read.ts";
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
    const route = requestRoute(raw);
    const request = input(() => decode(RequestCodec, binary(c.req.header("Envden-Request"))));
    const signature = binary(c.req.header("Envden-Signature"), 64);
    const url = new URL(raw.url);

    verifyBinding(c, request);

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
        { bodyHash: request.bodyHash },
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

    const release = await verifiedBody(c, options, route);

    try {
      await next();
    } finally {
      release();
    }
  });
}

function verifyBinding(c: Context<TServerEnv>, request: IRequest) {
  const raw = c.req.raw;
  const url = new URL(raw.url);

  if (
    !equal(request.device, binary(c.req.header("Envden-Device"), 16)) ||
    String(request.time) !== c.req.header("Envden-Time") ||
    !equal(request.nonce, binary(c.req.header("Envden-Nonce"), 16)) ||
    request.method !== raw.method ||
    request.pathAndQuery !== url.pathname + url.search ||
    !equal(request.bodyHash, binary(c.req.header("Envden-Body-Hash"), 32))
  )
    throw new EnvdenError("UNAUTHORIZED", "Request binding mismatch");
}
