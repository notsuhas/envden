import { EnvdenError } from "@envden/core/errors";
import type { IAuth } from "../http/types.ts";

export function requireMember(auth: IAuth): void {
  if (!auth.member) throw new EnvdenError("NOT_MEMBER", "Membership required");
}
