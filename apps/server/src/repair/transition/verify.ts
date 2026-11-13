import type { IDeviceListState } from "@envden/core/chain";
import type { ISigned, IManifestHeader } from "@envden/core/protocol";
import { operationRequirement, checkedFiles, changedFiles } from "@envden/core/chain";
import { decode, equal, FilesCodec, H, type ISwap } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions } from "../../http/types.ts";

export function verifyTransition(
  options: IAppOptions,
  swap: ISwap,
  previous: ISigned<IManifestHeader>,
  before: IDeviceListState,
  vaultId: Uint8Array,
) {
  const { storage } = options;
  const h = swap.header.body;

  try {
    operationRequirement(previous.body, h, swap.entries, before);
    const done = swap.entries[0]?.body;

    if (done?.kind === 6 && !storage.header(vaultId, done.payload.restoredHead))
      throw new EnvdenError("INVALID_DATA", "Unknown restored ancestor");

    verifyFiles(options, swap, previous, vaultId);

    if (swap.keyring && !equal(H("keyring-blob", swap.keyring), h.keyringHash))
      throw new EnvdenError("INVALID_DATA", "Keyring hash mismatch");

    if (swap.envelope && !equal(H("envelope-blob", swap.envelope), h.envelopeHash))
      throw new EnvdenError("INVALID_DATA", "Envelope hash mismatch");
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid history transition", { cause });
  }
}

function verifyFiles(
  options: IAppOptions,
  swap: ISwap,
  previous: ISigned<IManifestHeader>,
  vaultId: Uint8Array,
) {
  const { storage } = options;
  const h = swap.header.body;

  if (swap.files) {
    checkedFiles(swap.files, h.filesHash);
    const old = storage.fileList(vaultId, previous.body.filesHash);

    if (old)
      changedFiles(
        decode(FilesCodec, old),
        swap.files,
        previous.body.epoch,
        h.epoch,
        [1, 11].includes(h.op) ? h.op : undefined,
      );
  }

  if (h.op === 11 && (!swap.files || !storage.fileList(vaultId, previous.body.filesHash)))
    throw new EnvdenError("INVALID_DATA", "Repair lists required");
}
