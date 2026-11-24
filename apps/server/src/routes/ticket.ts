import type { Hono } from "hono";
import { RecoveryTicketSchema } from "@envden/core/protocol";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { binary, input } from "../http/encoding.ts";
import { issueRecoveryTicket } from "../auth/recovery.ts";

export function registerRecoveryTicket(app: Hono<TServerEnv>, options: IAppOptions) {
  return app.post("/v1/recovery/ticket", async (c) => {
    const raw: unknown = await c.req.json();
    const body = input(() => RecoveryTicketSchema.parse(raw));

    return c.json(issueRecoveryTicket(options, c.get("auth"), binary(body.proofPub, 32)));
  });
}
