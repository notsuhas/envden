import { sha256, concat } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { mailboxVault } from "./lookup.ts";

export function chargeMailbox(options: IAppOptions, auth: IAuth, number: number) {
  if (auth.member) return;
  const { storage, now } = options;
  const vault = mailboxVault(storage, auth.request.vaultId, number);
  if (!storage.mailbox(vault, number, now())) throw new EnvdenError("NOT_FOUND", "Mailbox closed");
  const encoder = new TextEncoder();
  const mailbox = sha256(concat(encoder.encode(`mailbox/${number}/`), vault));
  const boxCharge = storage.charge(mailbox, { kind: "mailbox" }, now());
  if (boxCharge.kind === "locked") throw new EnvdenError("RATE_LIMITED", "Too many mailbox writes");

  const deviceCharge = storage.charge(
    vault,
    { kind: "mailbox", device: auth.request.device },
    now(),
  );

  if (deviceCharge.kind === "locked")
    throw new EnvdenError("RATE_LIMITED", "Too many mailbox writes");
}
