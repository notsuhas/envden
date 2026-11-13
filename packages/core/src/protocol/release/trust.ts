import { equal } from "../encoding/binary.ts";
import { type IKeyPair } from "../codecs/releases/key-pair.ts";

export interface IReleaseTrust {
  generation: number;
  keys: IKeyPair;
}

export interface IReleaseCounter {
  seq: bigint;
  feed: Uint8Array;
}

export interface IReleaseState extends IReleaseTrust {
  primary?: IReleaseCounter | undefined;
  backup?: IReleaseCounter | undefined;
  primaryRevoked: boolean;
  unsafe: string[];
}

export function initialReleaseState(builtin: IReleaseTrust, stored?: IReleaseState): IReleaseState {
  if (stored && stored.generation > builtin.generation) return stored;
  const same = stored?.generation === builtin.generation;

  const samePrimary = same && equal(stored.keys.primary, builtin.keys.primary),
    sameBackup = same && equal(stored.keys.backup, builtin.keys.backup);

  return {
    ...builtin,
    primary: samePrimary ? stored.primary : undefined,
    backup: sameBackup ? stored.backup : undefined,
    primaryRevoked: samePrimary ? stored.primaryRevoked : false,
    unsafe: stored?.unsafe.slice() ?? [],
  };
}
