import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../client/request.ts";

export async function putSlot(
  client: TClient,
  mailbox: number,
  slot: string,
  message: string,
): Promise<void> {
  await client.request(`/v1/pairing/mailboxes/${mailbox}/${slot}`, "PUT", { message });
}

export async function getSlot(client: TClient, mailbox: number, slot: string): Promise<string> {
  const response = await client.request(`/v1/pairing/mailboxes/${mailbox}/${slot}`);

  return p.MessageResponseSchema.parse(await response.json()).message;
}

export function requireWindow(expiresAt: number, now: number): void {
  if (now >= expiresAt) throw new EnvdenError("UNAUTHORIZED", "Pairing exchange expired");
}
