import { milliseconds } from "date-fns";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../client/request.ts";

const JOIN_WINDOW = milliseconds({ minutes: 10 });

export async function putSlot(client: TClient, number: number, slot: string, message: string) {
  const response = await client.request(`/v1/join-requests/${number}/${slot}`, "PUT", { message });

  return p.JoinWriteResponseSchema.parse(await response.json()).expiresAt;
}

// Cancelling is best effort: the request also expires on its own.
export async function cancelRequest(client: TClient, number: number) {
  await client.request(`/v1/join-requests/${number}`, "DELETE").catch(() => undefined);
}

// The server's expiry can only shorten the window, so clock skew never refuses a fresh request.
export function requestDeadline(serverExpiry: number, now: number): number {
  if (now >= serverExpiry) throw new EnvdenError("UNAUTHORIZED", "Join request expired");

  return Math.min(serverExpiry, now + JOIN_WINDOW);
}
