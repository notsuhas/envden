import { membership } from "../../vault/chain.ts";
import { restoreFiles } from "../files.ts";
import {
  H,
  equal,
  decode,
  signedCodec,
  ManifestHeaderCodec,
  TransferResponseSchema,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";

function store(
  options: IAppOptions,
  auth: IAuth,
  kind: string,
  hash: Uint8Array,
  bytes: Uint8Array,
) {
  const vault = auth.request.vaultId;

  if (options.storage.vault(vault)?.restored) {
    if (!membership(options.storage, vault, auth.request.device))
      throw new EnvdenError("NOT_MEMBER", "Membership required");

    if (kind === "proofPub") throw new EnvdenError("INVALID_INPUT", "Invalid repair material");
  }

  if (kind === "files")
    return TransferResponseSchema.parse(restoreFiles(options, auth.request.vaultId, hash, bytes));

  validateMaterial(options, vault, kind, hash, bytes);

  options.storage.writeState(auth.request.vaultId, [
    {
      kind: kind === "keyring" ? "keyring" : kind === "envelope" ? "envelope" : "proofPub",
      key: kind === "keyring" ? hash : new Uint8Array(),
      bytes,
    },
  ]);

  return TransferResponseSchema.parse({ kind: "uploaded" });
}

function validateMaterial(
  options: IAppOptions,
  vault: Uint8Array,
  kind: string,
  hash: Uint8Array,
  bytes: Uint8Array,
) {
  if (bytes.length > 16777216 || !["keyring", "envelope", "proofPub"].includes(kind))
    throw new EnvdenError("INVALID_INPUT", "Invalid material");

  if (
    kind === "proofPub"
      ? bytes.length !== 32
      : !equal(H(kind === "keyring" ? "keyring-blob" : "envelope-blob", bytes), hash)
  )
    throw new EnvdenError("INVALID_DATA", "Material hash mismatch");

  if (kind !== "proofPub" && !referenced(options, vault, kind, hash))
    throw new EnvdenError("INVALID_DATA", "Unreferenced material");
}

function referenced(options: IAppOptions, vault: Uint8Array, kind: string, hash: Uint8Array) {
  if (kind === "envelope") {
    const head = options.storage.head(vault);
    const stored = head && options.storage.header(vault, head);

    return stored ? equal(headerBody(stored.bytes).envelopeHash, hash) : false;
  }

  return options.storage
    .headers(vault, 1n, 0xffffffffffffffffn)
    .some((stored) => equal(headerBody(stored.bytes).keyringHash, hash));
}

function headerBody(bytes: Uint8Array) {
  return decode(signedCodec(ManifestHeaderCodec), bytes).body;
}

export function storeMaterial(
  options: IAppOptions,
  auth: IAuth,
  kind: string,
  hash: Uint8Array,
  bytes: Uint8Array,
) {
  return options.storage.transaction(() => store(options, auth, kind, hash, bytes));
}
