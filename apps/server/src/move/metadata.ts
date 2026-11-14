import type { Hono } from "hono";
import { UnlockPeriodSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { requireGate } from "../middleware/gates.ts";

export function registerMoveMetadata(app: Hono<TServerEnv>, options: IAppOptions) {
  return app
    .get("/v1/move/sk-pub", (c) => {
      const auth = c.get("auth");
      requireGate(options, auth, "fresh");

      if (options.storage.vault(auth.request.vaultId)!.skRefused)
        throw new EnvdenError("RECOVERY_KIT_REQUIRED", "Replace recovery kit before moving");

      const key = options.storage.state(auth.request.vaultId, "skPub", new Uint8Array());
      if (!key) throw new EnvdenError("NOT_FOUND", "Missing public key");

      return new Response(key);
    })
    .get("/v1/move/period", (c) => {
      const auth = c.get("auth");
      requireGate(options, auth, "fresh");

      return c.json(
        UnlockPeriodSchema.parse({
          period: options.storage.vault(auth.request.vaultId)!.unlockPeriod,
        }),
      );
    });
}
