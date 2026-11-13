import { base32 } from "../encoding/base32.ts";
import { b32 } from "../encoding/binary.ts";

import { requireValue } from "../encoding/binary.ts";

export function unlockIdentifiers(vaultId: Uint8Array) {
  const id = base32(b32.write(vaultId));

  return {
    userIdentifier: id,
    identifiers: { client: "envden/v1/unlock/" + id, server: "envden/v1/unlock-server" },
  };
}

export function pairingIdentifiers(pin: Uint8Array, mailbox: number) {
  requireValue(Number.isInteger(mailbox) && mailbox >= 1 && mailbox <= 999);

  return {
    userIdentifier: "envden/v1/pair",
    identifiers: {
      client: "envden/v1/pair/joiner",
      server: "envden/v1/pair/" + base32(b32.write(pin)) + "/" + mailbox,
    },
  };
}
