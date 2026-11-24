import { setTimeout } from "node:timers/promises";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../client/request.ts";

export type TPause = () => Promise<void>;

export const pauseBriefly: TPause = () => setTimeout(500);

// Polls a join request slot until it's written; the server's expiry can only shorten the wait.
export async function waitMessage(
  client: TClient,
  path: string,
  now: () => number,
  expiresAt: number,
  pause: TPause = pauseBriefly,
) {
  while (now() < expiresAt) {
    const body: unknown = await (await client.request(path)).json();
    const result = slotResponse(body);
    expiresAt = Math.min(expiresAt, result.expiresAt);
    if (result.message !== undefined) return result.message;

    await pause();
  }

  throw new EnvdenError("BUSY", "The join request expired. Run envden join again");
}

export function slotResponse(body: unknown) {
  const slot = p.JoinSlotResponseSchema.safeParse(body);
  if (!slot.success) throw new EnvdenError("INVALID_DATA", "Invalid join request response");

  return {
    expiresAt: slot.data.expiresAt,
    ...("message" in slot.data ? { message: slot.data.message } : {}),
  };
}

export async function fetchApproved(client: TClient): Promise<string | undefined> {
  try {
    const response = await client.request("/v1/join-requests/approved");

    return p.MessageResponseSchema.parse(await response.json()).message;
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "NOT_FOUND") return undefined;
    throw error;
  }
}
