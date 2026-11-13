import { equal } from "@envden/core/protocol";
import type { IStorageAdapter } from "@envden/core/adapters";

const namespace = new Uint8Array(32);

function indexKey(kind: "mailbox" | "approver", id: string): Uint8Array {
  return new TextEncoder().encode(`${kind}/${id}`);
}

export function indexMailbox(storage: IStorageAdapter, number: number, vaultId: Uint8Array): void {
  storage.writeState(namespace, [
    { kind: "pairing-index", key: indexKey("mailbox", String(number)), bytes: vaultId },
  ]);
}

export function indexJoiner(
  storage: IStorageAdapter,
  device: Uint8Array,
  vaultId: Uint8Array,
): void {
  storage.writeState(namespace, [
    {
      kind: "pairing-index",
      key: indexKey("approver", Buffer.from(device).toString("base64url")),
      bytes: vaultId,
    },
  ]);
}

export function mailboxVault(
  storage: IStorageAdapter,
  vaultId: Uint8Array,
  number: number,
): Uint8Array {
  if (!equal(vaultId, namespace)) return vaultId;

  return (
    storage.state(namespace, "pairing-index", indexKey("mailbox", String(number))) ?? namespace
  );
}

export function approverVault(
  storage: IStorageAdapter,
  vaultId: Uint8Array,
  device: Uint8Array,
): Uint8Array {
  if (!equal(vaultId, namespace)) return vaultId;

  return (
    storage.state(
      namespace,
      "pairing-index",
      indexKey("approver", Buffer.from(device).toString("base64url")),
    ) ?? namespace
  );
}
