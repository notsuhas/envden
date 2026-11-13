import { validCreationMaterial } from "./material.ts";
import { verifyChain } from "@envden/core/chain";
import {
  equal,
  ManifestHeaderCodec,
  verifyObject,
  serverPin,
  type ISwap,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

export function validateCreation(
  swap: ISwap,
  vaultId: Uint8Array,
  device: Uint8Array,
  publicKey: Uint8Array,
) {
  const chain = verifyChain(swap.entries);
  const h = swap.header.body;
  const signer = chain.kind === "valid" ? chain.state.devices.values().next().value : undefined;

  if (
    chain.kind !== "valid" ||
    !signer ||
    swap.entries.length !== 2 ||
    !equal(chain.state.vaultId, vaultId) ||
    !equal(chain.state.serverPin, serverPin(publicKey)) ||
    !equal(h.vaultId, vaultId) ||
    h.seq !== 1n ||
    h.op !== 0 ||
    h.epoch !== 1 ||
    h.listSeq !== 1n ||
    !equal(h.listHead, chain.state.head) ||
    !h.prev.every((b) => b === 0) ||
    !swap.expectedHead.every((b) => b === 0) ||
    !equal(h.signer, device) ||
    !equal(signer.id, device) ||
    !verifyObject(ManifestHeaderCodec, swap.header, signer.objPub, "manifest").ok ||
    !validCreationMaterial(swap)
  )
    throw new EnvdenError("INVALID_DATA", "Invalid creation");
}
