import type { Hono } from "hono";
import { UnlockPeriodSchema } from "@envden/core/protocol";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { input } from "../http/encoding.ts";
import { gateMiddleware } from "../middleware/gates.ts";
import { setUnlockPeriod } from "../auth/settings.ts";

export function registerSettings(app: Hono<TServerEnv>, options: IAppOptions) {
  return app
    .get("/v1/settings/unlock-period", gateMiddleware(options, "unlocked"), (c) =>
      c.json(
        UnlockPeriodSchema.parse({
          period: options.storage.vault(c.get("auth").request.vaultId)!.unlockPeriod,
        }),
      ),
    )
    .put("/v1/settings/unlock-period", gateMiddleware(options, "fresh"), async (c) => {
      const raw: unknown = await c.req.json();
      const body = input(() => UnlockPeriodSchema.parse(raw));

      return c.json(setUnlockPeriod(options, c.get("auth"), body.period));
    });
}
