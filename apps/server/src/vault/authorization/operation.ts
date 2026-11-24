import { requireRepair } from "./repair.ts";
import type { TAuthorization } from "@envden/core/chain";
import { equal, type ISwap } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IStoredJoinRequest, IStoredSwap } from "@envden/core/adapters";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { requireMember } from "../../middleware/member.ts";
import { requireJoinTicket } from "../../auth/ticket.ts";

export function authorizeOperation(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  required: TAuthorization,
  stored: IStoredSwap,
  request?: number,
) {
  const { storage } = options;
  const { vaultId, device } = auth.request;
  const vault = storage.vault(vaultId)!;

  switch (required) {
    case "member":
      requireMember(auth);
      break;
    case "member-or-repair-token":
      if (vault.restored) requireRepair(options, auth);
      else requireMember(auth);

      break;
    case "repair-token":
      requireRepair(options, auth);
      break;
    case "join-ticket":
      authorizeTicket(options, auth, swap, stored);
      break;
    case "join-grant":
      authorizeJoinGrant(options, auth, swap, stored, request);
      break;
    case "move-session": {
      const owner = storage.state(vaultId, "move-session", new Uint8Array());

      if (!vault.frozen || !auth.member || !owner || !equal(owner, device))
        throw new EnvdenError("UNAUTHORIZED", "Move session required");

      break;
    }
    case "move-import":
      if (vault.active || !auth.member)
        throw new EnvdenError("UNAUTHORIZED", "Inactive import required");

      break;
  }
}

function authorizeJoinGrant(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  stored: IStoredSwap,
  number: number | undefined,
) {
  const entry = swap.entries[0]?.body;

  const request =
    number === undefined ? undefined : options.storage.joinRequest(number, options.now());

  if (entry?.kind !== 1 || !request || !holdsGrant(auth, request, entry.signer))
    throw new EnvdenError("UNAUTHORIZED", "Join request grant required");

  if (!equal(request.joiner, entry.payload.device.id))
    throw new EnvdenError("UNAUTHORIZED", "Join request device mismatch");

  stored.closeJoinRequest = request.number;
  stored.approver = { device: entry.payload.device.id, bytes: swap.approver! };
}

// Only the member that claimed the request, in its own vault, may approve once the joiner revealed.
function holdsGrant(auth: IAuth, request: IStoredJoinRequest, signer: Uint8Array) {
  const { vaultId, device } = auth.request;
  const claim = request.claim;

  return (
    auth.member &&
    !!claim &&
    !!request.slots.reveal &&
    equal(signer, device) &&
    equal(claim.vault, vaultId) &&
    equal(claim.device, device)
  );
}

function authorizeTicket(options: IAppOptions, auth: IAuth, swap: ISwap, stored: IStoredSwap) {
  const { device } = auth.request;
  const entry = swap.entries[0]?.body;
  requireJoinTicket(options, auth);

  if (entry?.kind !== 1 || !equal(entry.payload.device.id, device))
    throw new EnvdenError("UNAUTHORIZED", "Ticket device mismatch");

  stored.consumeSessions = [{ kind: "join-ticket", device, purpose: "recovery" }];
}
