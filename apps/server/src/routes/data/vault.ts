import type { Hono } from "hono";
import { decode, SwapCodec, H } from "@envden/core/protocol";
import type { IAppOptions, TServerEnv } from "../../http/types.ts";
import { protocolInput } from "../../http/protocol.ts";
import { commitResponse } from "../../http/result.ts";
import { createVault } from "../../vault/create.ts";
import { commitVaultSwap } from "../../vault/swap.ts";

export function registerVault(app: Hono<TServerEnv>, options: IAppOptions) {
  return app
    .post("/v1/vault", async (c) => {
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const swap = protocolInput(() => decode(SwapCodec, bytes));

      return c.json(commitResponse(createVault(options, c.get("auth"), swap, H("swap", bytes))));
    })
    .post("/v1/swap", async (c) => {
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const swap = protocolInput(() => decode(SwapCodec, bytes));
      const request = c.req.query("request");

      const result = commitVaultSwap(
        options,
        c.get("auth"),
        swap,
        H("swap", bytes),
        request === undefined ? undefined : Number(request),
      );

      return c.json(commitResponse(result), result.kind === "head-moved" ? 409 : 200);
    });
}
