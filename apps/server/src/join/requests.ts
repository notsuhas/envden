import {
  DeviceRecordCodec,
  JoinOpenedSchema,
  JoinRequestsSchema,
  JoinSlotResponseSchema,
  JoinWriteResponseSchema,
  JoinClosedSchema,
  MessageResponseSchema,
  decode,
  equal,
} from "@envden/core/protocol";
import type { IStoredJoinRequest, TJoinSlot } from "@envden/core/adapters";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { binary, text } from "../http/encoding.ts";
import { joinSide, type TJoinAction, type TJoinRole } from "./side.ts";

export function openJoinRequest(
  options: IAppOptions,
  auth: IAuth,
  record: Uint8Array,
  commit: Uint8Array,
) {
  const opened = options.storage.openJoinRequest(
    auth.request.device,
    record,
    commit,
    options.now(),
  );

  if (!opened) throw new EnvdenError("RATE_LIMITED", "Too many join requests");

  return JoinOpenedSchema.parse({ number: opened.number, expiresAt: opened.expiresAt });
}

export function listJoinRequests(options: IAppOptions) {
  const requests = options.storage
    .joinRequests(options.now())
    .filter((request) => !request.claim)
    .map((request) => ({
      number: request.number,
      name: decode(DeviceRecordCodec, request.record).name,
      commit: text(request.commit),
      expiresAt: request.expiresAt,
    }));

  return JoinRequestsSchema.parse({ requests });
}

export function accessJoinRequest(
  options: IAppOptions,
  auth: IAuth,
  number: number,
  action: TJoinAction,
) {
  const request = options.storage.joinRequest(number, options.now());
  if (!request) throw new EnvdenError("NOT_FOUND", "Join request closed");

  if (joinSide(joinRole(auth, request), action, !!request.claim).kind === "denied")
    throw new EnvdenError("UNAUTHORIZED", "Wrong side of the join request");

  return request;
}

export function writeJoinSlot(
  options: IAppOptions,
  auth: IAuth,
  number: number,
  slot: TJoinSlot,
  message: string,
) {
  const request = accessJoinRequest(options, auth, number, { kind: "write", slot });
  const bytes = binary(message);
  if (bytes.length > 4096) throw new EnvdenError("INVALID_INPUT", "Message too large");
  const { vaultId, device } = auth.request;

  const result = options.storage.writeJoinRequest(
    number,
    slot,
    bytes,
    options.now(),
    ...(slot === "offer" ? [{ vault: vaultId, device }] : []),
  );

  if (result === "closed") throw new EnvdenError("CONFLICT", "Join request closed");
  if (result === "out-of-order") throw new EnvdenError("CONFLICT", "Join request has no offer yet");

  return JoinWriteResponseSchema.parse({ kind: result, expiresAt: request.expiresAt });
}

export function readJoinSlot(options: IAppOptions, auth: IAuth, number: number, slot: TJoinSlot) {
  const request = accessJoinRequest(options, auth, number, { kind: "read", slot });
  const bytes = request.slots[slot];

  return JoinSlotResponseSchema.parse(
    bytes
      ? { message: text(bytes), expiresAt: request.expiresAt }
      : { kind: "pending", expiresAt: request.expiresAt },
  );
}

export function closeJoinRequest(options: IAppOptions, auth: IAuth, number: number) {
  accessJoinRequest(options, auth, number, { kind: "close" });
  options.storage.closeJoinRequest(number);

  return JoinClosedSchema.parse({ kind: "closed" });
}

export function fetchApproved(options: IAppOptions, auth: IAuth) {
  const bytes = options.storage.approver(auth.request.vaultId, auth.request.device, options.now());
  if (!bytes) throw new EnvdenError("NOT_FOUND", "Approval unavailable");

  return MessageResponseSchema.parse({ message: text(bytes) });
}

function joinRole(auth: IAuth, request: IStoredJoinRequest): TJoinRole {
  const { vaultId, device } = auth.request;

  if (!auth.member) return equal(request.joiner, device) ? "joiner" : "other";

  if (request.claim && equal(request.claim.vault, vaultId) && equal(request.claim.device, device))
    return "claimer";

  return "member";
}
