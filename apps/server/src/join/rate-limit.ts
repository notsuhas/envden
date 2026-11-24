import { sha256, concat } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";

// Rejected writers share their own bucket per request, so they can't use up the joiner's.
export function chargeJoinWrite(
  options: IAppOptions,
  auth: IAuth,
  number: number,
  authorize: () => unknown,
) {
  if (auth.member) {
    authorize();

    return;
  }

  const { storage, now } = options;
  const request = storage.joinRequest(number, now());
  if (!request) throw new EnvdenError("NOT_FOUND", "Join request closed");
  const key = sha256(new TextEncoder().encode(`join/${number}/${request.expiresAt}`));

  try {
    authorize();
  } catch (error) {
    const rejected = sha256(concat(new TextEncoder().encode("rejected/"), key));
    const charge = storage.charge(rejected, { kind: "join" }, now());
    if (charge.kind === "locked") throw new EnvdenError("RATE_LIMITED", "Too many join writes");
    throw error;
  }

  const charge = storage.charge(key, { kind: "join" }, now());
  if (charge.kind === "locked") throw new EnvdenError("RATE_LIMITED", "Too many join writes");
}
