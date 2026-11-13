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
  for (let attempt = 0; attempt < 600 && now() < expiresAt; attempt++) {
    try {
      const body: unknown = await (await client.request(path)).json();
      const message = p.MessageResponseSchema.safeParse(body);
      if (message.success) return message.data.message;
      const pending = p.PendingResponseSchema.safeParse(body);
      if (!pending.success) throw new EnvdenError("INVALID_DATA", "Invalid pairing response");
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
