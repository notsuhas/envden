import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../client/request.ts";

export async function putSlot(client: TClient, mailbox: number, slot: string, message: string) {
  const response = await client.request(`/v1/pairing/mailboxes/${mailbox}/${slot}`, "PUT", {
    message,
  });

  return p.MailboxWriteResponseSchema.parse(await response.json()).expiresAt;
}

export async function getSlot(client: TClient, mailbox: number, slot: string): Promise<string> {
  const response = await client.request(`/v1/pairing/mailboxes/${mailbox}/${slot}`);

  const result = p.MailboxSlotResponseSchema.parse(await response.json());
  if (!("message" in result)) throw new EnvdenError("NOT_FOUND", "Pairing message pending");

  return result.message;
}

export function requireWindow(expiresAt: number, now: number): void {
  if (now >= expiresAt) throw new EnvdenError("UNAUTHORIZED", "Pairing exchange expired");
}
