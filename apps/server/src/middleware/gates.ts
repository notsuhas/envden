import { createMiddleware } from "hono/factory";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth, TServerEnv } from "../http/types.ts";

export function requireGate(options: IAppOptions, auth: IAuth, gate: "fresh" | "unlocked"): void {
  const { storage, now } = options;
  const { vaultId, device } = auth.request;
  const state = storage.device(vaultId, device);
  const never = gate === "unlocked" && storage.vault(vaultId)?.unlockPeriod === null;
  const until = gate === "fresh" ? state?.freshUntil : state?.unlockedUntil;

  if (!auth.member || (!never && (until === undefined || now() >= until)))
    throw new EnvdenError("LOCKED", "Login required");
}

export function gateMiddleware(options: IAppOptions, gate: "fresh" | "unlocked") {
  return createMiddleware<TServerEnv>(async (c, next) => {
    requireGate(options, c.get("auth"), gate);

    await next();
  });
}
