import { H, equal, decode, FilesCodec } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions } from "../http/types.ts";
import { vaultChain } from "../vault/chain.ts";

export function requireMoveMaterial(options: IAppOptions, vaultId: Uint8Array) {
  const { storage } = options;
  const { header } = vaultChain(storage, vaultId);
  const keyring = storage.state(vaultId, "keyring", header.body.keyringHash);
  const envelope = storage.state(vaultId, "envelope", new Uint8Array());
  const proofPub = storage.state(vaultId, "proofPub", new Uint8Array());
  const fileBytes = storage.fileList(vaultId, header.body.filesHash);

  requireCurrentMaterial(header.body.keyringHash, keyring, "keyring-blob");
  requireCurrentMaterial(header.body.envelopeHash, envelope, "envelope-blob");
  requireCurrentMaterial(header.body.filesHash, fileBytes, "files");
  if (proofPub?.length !== 32) throw new EnvdenError("INVALID_DATA", "Incomplete move material");
  if (!fileBytes) throw new EnvdenError("INVALID_DATA", "Missing head file list");

  for (const hash of storage.blobHashes(vaultId)) {
    const blob = storage.getBlob(vaultId, hash);

    if (!blob || !equal(H("blob", blob), hash))
      throw new EnvdenError("INVALID_DATA", "Invalid imported blob");
  }

  for (const file of decode(FilesCodec, fileBytes).entries)
    if ([1, 3].includes(file.state) && !storage.hasBlob(vaultId, file.blobHash))
      throw new EnvdenError("INVALID_DATA", "Missing imported blob");
}

function requireCurrentMaterial(hash: Uint8Array, bytes: Uint8Array | undefined, domain: string) {
  if (!bytes || !equal(H(domain, bytes), hash))
    throw new EnvdenError("INVALID_DATA", "Incomplete move material");
}
