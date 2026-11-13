import { verifyTransition } from "./transition/verify.ts";
import { applyEntry } from "@envden/core/chain";
import {
  base32,
  equal,
  ManifestHeaderCodec,
  objectHash,
  verifyObject,
  type ISwap,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { vaultChain } from "../vault/chain.ts";

export function verifyHistory(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  checkUploader = true,
) {
  const { storage } = options;
  const vaultId = auth.request.vaultId;
  const { header: previous, state: before } = vaultChain(storage, vaultId);
  let state = before;
  const h = swap.header.body;

  if (
    !equal(swap.expectedHead, objectHash(ManifestHeaderCodec, previous, "manifest")) ||
    !equal(h.prev, swap.expectedHead) ||
    h.seq !== previous.body.seq + 1n ||
    !equal(h.vaultId, vaultId)
  )
    throw new EnvdenError("INVALID_DATA", "History linkage mismatch");

  for (const entry of swap.entries) {
    const result = applyEntry(state, entry);
    if (result.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid history entry");
    state = result.state;
  }

  const signer = state.devices.get(base32(h.signer));

  if (
    !signer ||
    !verifyObject(ManifestHeaderCodec, swap.header, signer.objPub, "manifest").ok ||
    h.listSeq !== state.seq ||
    !equal(h.listHead, state.head) ||
    h.epoch !== state.epoch ||
    (checkUploader &&
      !!storage.vault(vaultId)?.restored &&
      !state.devices.has(base32(auth.request.device)))
  )
    throw new EnvdenError("INVALID_DATA", "Invalid history header");

  verifyTransition(options, swap, previous, before, vaultId);
}
