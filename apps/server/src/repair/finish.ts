import { RepairFinishSchema, decode, SwapCodec, H } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { input, binary } from "../http/encoding.ts";
import { protocolInput } from "../http/protocol.ts";
import { requireRepair } from "../vault/authorization.ts";
import { finishLogin } from "../auth/login.ts";
import { finishRegistration } from "../auth/registration.ts";
import { commitVaultSwap } from "../vault/swap.ts";

export async function finishRepair(options: IAppOptions, auth: IAuth, raw: unknown) {
  requireRepair(options, auth);
  const body = input(() => RepairFinishSchema.parse(raw));
  const bytes = binary(body.swap);
  const swap = protocolInput(() => decode(SwapCodec, bytes));
  if (swap.header.body.op !== 12) throw new EnvdenError("INVALID_INPUT", "Repair close required");

  if (body.kind === "login") await finishLogin(options, auth, "unlock", body.message);
  else finishRegistration(options, auth, body.message);

  return commitVaultSwap(options, auth, swap, H("swap", bytes));
}
