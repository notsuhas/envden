import { milliseconds } from "date-fns";
import { requireRepair } from "./repair.ts";
import type { TAuthorization } from "@envden/core/chain";
import { equal, type ISwap } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IStoredSwap } from "@envden/core/adapters";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { requireGate } from "../../middleware/gates.ts";
import { hasProof } from "../../auth/token.ts";
import { requireJoinTicket } from "../../auth/ticket.ts";
import { requireMailboxGrant } from "../../pairing/grant.ts";

export function authorizeOperation(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  required: TAuthorization,
  stored: IStoredSwap,
  mailbox?: number,
) {
  const { storage } = options;
  const { vaultId, device } = auth.request;
  const vault = storage.vault(vaultId)!;

  switch (required) {
    case "unlocked":
      requireGate(options, auth, "unlocked");
      break;
    case "fresh":
      requireGate(options, auth, "fresh");
      break;
    case "fresh-or-repair-token":
      if (vault.restored) requireRepair(options, auth);
      else requireGate(options, auth, "fresh");

      break;
    case "repair-token":
      requireRepair(options, auth);
      break;
    case "sk-proof":
      if (!auth.member || !hasProof(options, auth, "sk"))
        throw new EnvdenError("UNAUTHORIZED", "Secret key proof required");

      break;
    case "join-ticket":
      authorizeTicket(options, auth, swap, stored);
      break;
    case "mailbox-grant":
      authorizeMailbox(options, auth, swap, stored, mailbox);
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

function authorizeMailbox(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  stored: IStoredSwap,
  mailbox: number | undefined,
) {
  const { storage } = options;
  const { vaultId, device } = auth.request;
  const entry = swap.entries[0]?.body;

  if (mailbox === undefined || entry?.kind !== 1 || !equal(entry.signer, device))
    throw new EnvdenError("UNAUTHORIZED", "Mailbox required");

  requireMailboxGrant(options, auth, mailbox);

  const bound = storage.state(
    vaultId,
    "mailbox-joiner",
    new Uint8Array([mailbox >> 8, mailbox & 255]),
  );

  if (!bound || !equal(bound, entry.payload.device.id))
    throw new EnvdenError("UNAUTHORIZED", "Mailbox joiner mismatch");

  stored.closeMailbox = mailbox;
  stored.approver = { device: entry.payload.device.id, bytes: swap.approver! };

  stored.devices = [
    {
      id: entry.payload.device.id,
      state: {
        unlockedUntil: storage.device(vaultId, device)!.unlockedUntil,
        freshUntil: 0,
        clientVersion: "",
      },
    },
  ];
}

function authorizeTicket(options: IAppOptions, auth: IAuth, swap: ISwap, stored: IStoredSwap) {
  const { storage, now } = options;
  const { device, vaultId } = auth.request;
  const vault = storage.vault(vaultId)!;
  const entry = swap.entries[0]?.body;
  requireJoinTicket(options, auth);

  if (entry?.kind !== 1 || !equal(entry.payload.device.id, device))
    throw new EnvdenError("UNAUTHORIZED", "Ticket device mismatch");

  stored.consumeSessions = [{ kind: "join-ticket", device, purpose: "kit" }];

  stored.devices = [
    {
      id: device,
      state: {
        unlockedUntil: now() + (vault.unlockPeriod ?? milliseconds({ days: 30 })),
        freshUntil: 0,
        clientVersion: auth.request.clientVersion,
      },
    },
  ];
}
