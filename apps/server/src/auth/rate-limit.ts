import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function charge(options: IAppOptions, auth: IAuth): string {
  const result = options.storage.charge(
    auth.request.vaultId,
    auth.member ? { kind: "member", device: auth.request.device } : { kind: "non-member" },
    options.now(),
  );

  if (result.kind === "locked") throw new EnvdenError("RATE_LIMITED", "Too many attempts");

  return result.receipt;
}
