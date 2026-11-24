import { EnvdenError } from "../../errors/index.ts";
import type { IStorageAdapter, IStoredSwap } from "../storage.ts";

export function prepareCommit(
  storage: Pick<
    IStorageAdapter,
    "setupToken" | "consumeSession" | "joinRequest" | "configureVault" | "hasVault"
  >,
  vault: Uint8Array,
  swap: IStoredSwap,
  now: number,
) {
  if (swap.setupTokenHash && !sameBytes(storage.setupToken(), swap.setupTokenHash))
    throw new EnvdenError("UNAUTHORIZED", "Setup token changed or consumed");

  for (const session of swap.consumeSessions ?? [])
    if (!storage.consumeSession(vault, session, now))
      throw new EnvdenError("UNAUTHORIZED", "Session expired or consumed");

  if (swap.closeJoinRequest !== undefined && !storage.joinRequest(swap.closeJoinRequest, now))
    throw new EnvdenError("NOT_FOUND", "Join request expired or closed");

  if (swap.vault) storage.configureVault(vault, swap.vault);

  if (!storage.hasVault(vault))
    throw new EnvdenError("INVALID_DATA", "Creation requires vault metadata");
}

export function writeCommitState(
  storage: Pick<IStorageAdapter, "writeState" | "putDevice">,
  vault: Uint8Array,
  swap: IStoredSwap,
) {
  storage.writeState(vault, swap.state ?? []);
  for (const device of swap.devices ?? []) storage.putDevice(vault, device.id, device.state);
}

function sameBytes(a: Uint8Array | undefined, b: Uint8Array) {
  return a !== undefined && a.length === b.length && a.every((value, index) => value === b[index]);
}
