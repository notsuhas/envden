import { sha256, concat } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { mailboxVault } from "./lookup.ts";

export function chargeMailbox(
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
  const vault = mailboxVault(storage, auth.request.vaultId, number);
  const box = storage.mailbox(vault, number, now());
  if (!box) throw new EnvdenError("NOT_FOUND", "Mailbox closed");

  const deviceCharge = storage.charge(
    vault,
    { kind: "mailbox", device: auth.request.device },
    now(),
  );

  if (deviceCharge.kind === "locked")
    throw new EnvdenError("RATE_LIMITED", "Too many mailbox writes");

  authorize();

  const mailbox = sha256(
    concat(new TextEncoder().encode(`mailbox/${number}/${box.expiresAt}/`), vault),
  );

  const boxCharge = storage.charge(mailbox, { kind: "mailbox" }, now());
  if (boxCharge.kind === "locked") throw new EnvdenError("RATE_LIMITED", "Too many mailbox writes");
}
