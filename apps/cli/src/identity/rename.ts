import type { IKeychainAdapter } from "@envden/core/adapters";
import { equal, type IDeviceRecord } from "@envden/core/protocol";
import { identityBytes, readIdentity } from "./stored.ts";

export async function adoptCommittedName(
  keychain: IKeychainAdapter,
  home: string,
  committed: IDeviceRecord,
) {
  for (const slot of [`envden/${home}/rejoin/device`, `envden/${home}/device`]) {
    const stored = await keychain.get(slot);
    if (!stored) continue;

    const identity = readIdentity(stored);

    if (!equal(identity.record.id, committed.id) || identity.record.name === committed.name)
      continue;

    await keychain.set(
      slot,
      identityBytes(identity.keys, { ...identity.record, name: committed.name }),
    );
  }
}
