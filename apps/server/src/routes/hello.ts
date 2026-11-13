import { requestRoute } from "./policy.ts";
import {
  HelloResponseSchema,
  buildHello,
  signedCodec,
  ServerHelloCodec,
  encode,
} from "@envden/core/protocol";
import type { Hono } from "hono";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { binary, text } from "../http/encoding.ts";

function hello(options: IAppOptions, challenge: Uint8Array, host: string) {
  const signed = buildHello(
    {
      challenge,
      host: host.toLowerCase(),
      serverSignPub: options.serverKeys.publicKey,
      appVersion: options.config.appVersion,
      minClient: options.config.minClient,
      protocols: [1],
    },
    options.serverKeys.secretKey,
  );

  return HelloResponseSchema.parse({ hello: text(encode(signedCodec(ServerHelloCodec), signed)) });
}

export function registerHello(app: Hono<TServerEnv>, options: IAppOptions) {
  return app.get("/v1/hello", (c) => {
    requestRoute(c.req.raw);

    return c.json(
      hello(options, binary(c.req.query("challenge"), 32), new URL(c.req.url).hostname),
    );
  });
}
