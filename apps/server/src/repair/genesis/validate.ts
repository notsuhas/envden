import { verifyChain } from "@envden/core/chain";
import {
  FilesCodec,
  base32,
  equal,
  H,
  ManifestHeaderCodec,
  verifyObject,
  type ISwap,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";

export function verifyGenesis(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  checkUploader: boolean,
) {
  const { storage } = options;
  const vaultId = auth.request.vaultId;
  const result = verifyChain(swap.entries);
  const h = swap.header.body;
  const member = result.kind === "valid" && result.state.devices.get(base32(h.signer));

  if (
    result.kind !== "valid" ||
    !member ||
    (checkUploader &&
      !!storage.vault(vaultId)?.restored &&
      !result.state.devices.has(base32(auth.request.device))) ||
    !equal(result.state.vaultId, vaultId) ||
    !equal(h.vaultId, vaultId) ||
    h.op !== 0 ||
    h.seq !== 1n ||
    h.listSeq !== 1n ||
    !equal(h.listHead, result.state.head) ||
    h.epoch !== 1 ||
    !h.prev.every((b) => b === 0) ||
    !swap.expectedHead.every((b) => b === 0) ||
    !validGenesisMaterial(swap) ||
    !verifyObject(ManifestHeaderCodec, swap.header, member.objPub, "manifest").ok
  )
    throw new EnvdenError("INVALID_DATA", "Invalid imported genesis");
}

function validGenesisMaterial(swap: ISwap) {
  const h = swap.header.body;

  return !(
    (!!swap.keyring && !equal(H("keyring-blob", swap.keyring), h.keyringHash)) ||
    (!!swap.envelope && !equal(H("envelope-blob", swap.envelope), h.envelopeHash)) ||
    !swap.files ||
    swap.files.entries.length !== 0 ||
    !equal(H("files", FilesCodec.write(swap.files)), h.filesHash)
  );
}
