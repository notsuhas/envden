import { equal } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { hasProof } from "../auth/token.ts";
import { requireGate } from "../middleware/gates.ts";
import { requireJoinTicket } from "../auth/ticket.ts";
import { requireRepair } from "./authorization.ts";
import { decode, signedCodec, ManifestHeaderCodec } from "@envden/core/protocol";

export function requireRead(
  options: IAppOptions,
  auth: IAuth,
  kind: "history" | "files" | "keyring" | "envelope" | "blob",
  hash?: Uint8Array,
) {
  const vault = options.storage.vault(auth.request.vaultId)!;

  if (vault.restored) {
    requireRepair(options, auth);
    if (!auth.member) throw new EnvdenError("NOT_MEMBER", "Membership required");

    return;
  }

  if (!vault.active) throw new EnvdenError("MOVING", "Vault moving");
  const restricted = !auth.member || hasProof(options, auth, "sk");

  if (restricted) {
    requireRestrictedRead(options, auth, kind, hash);

    return;
  }

  requireGate(options, auth, kind === "envelope" ? "fresh" : "unlocked");
}

function currentFiles(bytes: Uint8Array) {
  return decode(signedCodec(ManifestHeaderCodec), bytes).body.filesHash;
}

function requireRestrictedRead(
  options: IAppOptions,
  auth: IAuth,
  kind: "history" | "files" | "keyring" | "envelope" | "blob",
  hash: Uint8Array | undefined,
) {
  if (!auth.member) requireJoinTicket(options, auth);
  if (kind === "blob") throw new EnvdenError("UNAUTHORIZED", "Blob read requires unlock");

  if (kind === "files" || kind === "keyring") {
    const head = options.storage.head(auth.request.vaultId)!;
    const header = options.storage.header(auth.request.vaultId, head)!;

    if (
      !hash ||
      !equal(
        hash,
        kind === "files"
          ? currentFiles(header.bytes)
          : decode(signedCodec(ManifestHeaderCodec), header.bytes).body.keyringHash,
      )
    )
      throw new EnvdenError("UNAUTHORIZED", "Head files only");
  }
}
