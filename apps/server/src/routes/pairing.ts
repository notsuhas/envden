import type { Hono } from "hono";
import { MailboxSlotSchema, MailboxWriteSchema } from "@envden/core/protocol";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { input } from "../http/encoding.ts";
import { gateMiddleware } from "../middleware/gates.ts";
import {
  openMailbox,
  readSlot,
  writeSlot,
  closeMailbox,
  fetchApprover,
} from "../pairing/mailbox.ts";
import { EnvdenError } from "@envden/core/errors";

function mailboxNumber(value: string): number {
  if (!/^[1-9][0-9]{0,2}$/.test(value))
    throw new EnvdenError("INVALID_INPUT", "Invalid mailbox number");

  return Number(value);
}

export function registerPairing(app: Hono<TServerEnv>, options: IAppOptions) {
  return app
    .post("/v1/pairing/mailboxes", gateMiddleware(options, "fresh"), (c) =>
      c.json(openMailbox(options, c.get("auth"))),
    )
    .get("/v1/pairing/mailboxes/:number/:slot", (c) => {
      const number = mailboxNumber(c.req.param("number"));
      const slot = input(() => MailboxSlotSchema.parse(c.req.param("slot")));

      return c.json(readSlot(options, c.get("auth"), number, slot));
    })
    .put("/v1/pairing/mailboxes/:number/:slot", async (c) => {
      const number = mailboxNumber(c.req.param("number"));
      const slot = input(() => MailboxSlotSchema.parse(c.req.param("slot")));
      const raw: unknown = await c.req.json();
      const body = input(() => MailboxWriteSchema.parse(raw));

      return c.json(writeSlot(options, c.get("auth"), number, slot, body.message));
    })
    .delete("/v1/pairing/mailboxes/:number", (c) =>
      c.json(closeMailbox(options, c.get("auth"), mailboxNumber(c.req.param("number")))),
    )
    .get("/v1/pairing/approver", (c) => c.json(fetchApprover(options, c.get("auth"))));
}
