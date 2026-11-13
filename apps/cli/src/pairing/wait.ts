import { setTimeout } from "node:timers/promises";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../client/request.ts";

export async function waitMessage(
  client: TClient,
  path: string,
  now: () => number,
  expiresAt: number,
  pause: () => Promise<void> = () => setTimeout(500),
) {
  while (now() < expiresAt) {
    try {
      const body: unknown = await (await client.request(path)).json();
      const result = pairingResponse(body, expiresAt);
      expiresAt = result.expiresAt;
      if (result.message !== undefined) return result.message;
    } catch (error) {
      if (
        !(error instanceof EnvdenError) ||
        error.code !== "NOT_FOUND" ||
        path !== "/v1/pairing/approver"
      )
        throw error;
    }

    await pause();
  }

  throw new EnvdenError(
    "UNAUTHORIZED",
    "Pairing timed out; run envden join --resume after approval, or create a new pairing code",
  );
}

export function pairingResponse(body: unknown, expiresAt: number) {
  const slot = p.MailboxSlotResponseSchema.safeParse(body);

  if (slot.success)
    return {
      expiresAt: slot.data.expiresAt,
      ...("message" in slot.data ? { message: slot.data.message } : {}),
    };

  const message = p.MessageResponseSchema.safeParse(body);
  if (message.success) return { expiresAt, message: message.data.message };

  if (!p.PendingResponseSchema.safeParse(body).success)
    throw new EnvdenError("INVALID_DATA", "Invalid pairing response");

  return { expiresAt };
}
