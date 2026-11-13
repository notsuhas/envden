import { restoreFiles } from "../files.ts";
import { H, equal, TransferResponseSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";

export function storeMaterial(
  options: IAppOptions,
  auth: IAuth,
  kind: string,
  hash: Uint8Array,
  bytes: Uint8Array,
) {
  if (kind === "files")
    return TransferResponseSchema.parse(restoreFiles(options, auth.request.vaultId, hash, bytes));

  if (bytes.length > 16777216 || !["keyring", "envelope", "skPub"].includes(kind))
    throw new EnvdenError("INVALID_INPUT", "Invalid material");

  if (
    kind === "skPub"
      ? bytes.length !== 32
      : !equal(H(kind === "keyring" ? "keyring-blob" : "envelope-blob", bytes), hash)
  )
    throw new EnvdenError("INVALID_DATA", "Material hash mismatch");

  options.storage.writeState(auth.request.vaultId, [
    {
      kind: kind === "keyring" ? "keyring" : kind === "envelope" ? "envelope" : "skPub",
      key: kind === "keyring" ? hash : new Uint8Array(),
      bytes,
    },
  ]);

  return TransferResponseSchema.parse({ kind: "uploaded" });
}
