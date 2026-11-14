import { membership } from "../vault/chain.ts";
import { requireGate } from "../middleware/gates.ts";
import {
  MailboxOpenedSchema,
  MailboxSlotResponseSchema,
  MailboxWriteResponseSchema,
  MailboxClosedSchema,
  MessageResponseSchema,
} from "@envden/core/protocol";
import { mailboxSide } from "./policy/side.ts";
import { EnvdenError } from "@envden/core/errors";
import { equal, OPAQUE_LENGTHS, opaqueMessage } from "@envden/core/protocol";
import type { TMailboxSlot } from "@envden/core/adapters";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { text, binary, input } from "../http/encoding.ts";
import { indexMailbox, indexJoiner, mailboxVault, approverVault } from "./lookup.ts";

export function openMailbox(options: IAppOptions, auth: IAuth) {
  const { vaultId, device } = auth.request;

  return options.storage.transaction(() => {
    auth = { ...auth, member: !!membership(options.storage, vaultId, device) };
    requireGate(options, auth, "fresh");
    const box = options.storage.openMailbox(vaultId, device, options.now());
    if (!box) throw new EnvdenError("RATE_LIMITED", "Mailbox limit reached");

    options.storage.writeState(vaultId, [
      { kind: "server-identity", key: new Uint8Array([box.number >> 8, box.number & 255]) },
    ]);

    indexMailbox(options.storage, box.number, vaultId);

    return MailboxOpenedSchema.parse({ number: box.number, expiresAt: box.expiresAt });
  });
}

export function accessible(
  options: IAppOptions,
  auth: IAuth,
  number: number,
  slot: TMailboxSlot,
  write: boolean,
) {
  const { storage, now } = options;
  const { device } = auth.request;
  const vaultId = mailboxVault(storage, auth.request.vaultId, number);
  const box = storage.mailbox(vaultId, number, now());
  if (!box) throw new EnvdenError("NOT_FOUND", "Mailbox closed");

  const owner = equal(box.device, device);

  requireMailboxSide(owner, write, slot);

  const bindingKey = new Uint8Array([number >> 8, number & 255]);
  const bound = storage.state(vaultId, "server-identity", bindingKey);

  requireJoiner(owner, bound, device, write, slot);

  return { box, bindingKey, bound, vaultId };
}

export function writeSlot(
  options: IAppOptions,
  auth: IAuth,
  number: number,
  slot: TMailboxSlot,
  message: string,
) {
  const { bindingKey, bound, box, vaultId } = accessible(options, auth, number, slot, true);
  const bytes = binary(message);
  const prior = box.slots[slot];

  if (prior && !equal(prior, bytes)) {
    options.storage.closeMailbox(vaultId, number);

    throw new EnvdenError("CONFLICT", "Mailbox closed");
  }

  if (bytes.length > 4096) throw new EnvdenError("INVALID_INPUT", "Message too large");

  const lengths = {
    KE1: OPAQUE_LENGTHS.startLoginRequest,
    KE2: OPAQUE_LENGTHS.loginResponse,
    KE3: OPAQUE_LENGTHS.finishLoginRequest,
    PairJoiner: undefined,
  };

  const length = lengths[slot];
  if (length !== undefined) input(() => opaqueMessage(message, length));

  const result = options.storage.writeMailbox(vaultId, number, slot, bytes, options.now());

  if (result === "closed") throw new EnvdenError("CONFLICT", "Mailbox closed");
  if (result === "out-of-order") throw new EnvdenError("CONFLICT", "Mailbox slot out of order");

  if (slot === "KE1" && (!bound || !box.slots.KE1))
    options.storage.writeState(vaultId, [
      { kind: "server-identity", key: bindingKey, bytes: auth.request.device },
    ]);

  if (slot === "PairJoiner") indexJoiner(options.storage, auth.request.device, vaultId);

  return MailboxWriteResponseSchema.parse({ kind: result, expiresAt: box.expiresAt });
}

export function readSlot(options: IAppOptions, auth: IAuth, number: number, slot: TMailboxSlot) {
  const { box } = accessible(options, auth, number, slot, false);
  const bytes = box.slots[slot];

  return MailboxSlotResponseSchema.parse(
    bytes
      ? { message: text(bytes), expiresAt: box.expiresAt }
      : { kind: "pending", expiresAt: box.expiresAt },
  );
}

export function closeMailbox(options: IAppOptions, auth: IAuth, number: number) {
  const box = options.storage.mailbox(auth.request.vaultId, number, options.now());

  if (!box || !equal(box.device, auth.request.device))
    throw new EnvdenError("UNAUTHORIZED", "Wrong mailbox owner");

  options.storage.closeMailbox(auth.request.vaultId, number);

  return MailboxClosedSchema.parse({ kind: "closed" });
}

export function fetchApprover(options: IAppOptions, auth: IAuth) {
  const bytes = options.storage.approver(
    approverVault(options.storage, auth.request.vaultId, auth.request.device),
    auth.request.device,
    options.now(),
  );

  if (!bytes) throw new EnvdenError("NOT_FOUND", "Approver unavailable");

  return MessageResponseSchema.parse({ message: text(bytes) });
}

function requireMailboxSide(owner: boolean, write: boolean, slot: TMailboxSlot) {
  if (mailboxSide(owner, write, slot).kind === "denied")
    throw new EnvdenError("UNAUTHORIZED", "Wrong mailbox side");
}

function requireJoiner(
  owner: boolean,
  bound: Uint8Array | undefined,
  device: Uint8Array,
  write: boolean,
  slot: TMailboxSlot,
) {
  if (!owner && bound && !equal(bound, device))
    throw new EnvdenError("UNAUTHORIZED", "Wrong joiner");

  if (!owner && !bound && (!write || slot !== "KE1"))
    throw new EnvdenError("UNAUTHORIZED", "Joiner not bound");
}
