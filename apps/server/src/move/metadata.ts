import type { Hono } from "hono";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { requireMember } from "../middleware/member.ts";

export function registerMoveMetadata(app: Hono<TServerEnv>, options: IAppOptions) {
  return app.get("/v1/move/proof-pub", (c) => {
    const auth = c.get("auth");
    requireMember(auth);

    if (options.storage.vault(auth.request.vaultId)!.proofRefused)
      throw new EnvdenError("RECOVERY_CODE_REQUIRED", "Replace the recovery code before moving");

    const key = options.storage.state(auth.request.vaultId, "proofPub", new Uint8Array());
    if (!key) throw new EnvdenError("NOT_FOUND", "Missing public key");

    return new Response(key);
  });
}
