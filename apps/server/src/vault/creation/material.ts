import { equal, H, FilesCodec, type ISwap } from "@envden/core/protocol";

export function validCreationMaterial(swap: ISwap): boolean {
  const h = swap.header.body;

  return !(
    !swap.files ||
    swap.files.entries.length !== 0 ||
    !equal(H("files", FilesCodec.write(swap.files)), h.filesHash) ||
    !swap.keyring ||
    !equal(H("keyring-blob", swap.keyring), h.keyringHash) ||
    !swap.envelope ||
    !equal(H("envelope-blob", swap.envelope), h.envelopeHash) ||
    !swap.skPub ||
    !swap.opaqueRecord ||
    swap.approver
  );
}
