import { validateSwap, repairLoginDecision } from "@envden/core/chain";
import { decode, FilesCodec, base32, serverPin, type ISwap } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { vaultChain } from "../chain.ts";
import { repairHistory } from "../../repair/close.ts";

export function validateForCommit(options: IAppOptions, auth: IAuth, swap: ISwap) {
  const { storage } = options;
  const { vaultId } = auth.request;
  const { header: previous, state } = vaultChain(storage, vaultId);
  const fileBytes = storage.fileList(vaultId, previous.body.filesHash);
  if (!fileBytes) throw new EnvdenError("INVALID_DATA", "Missing head file list");
  const files = decode(FilesCodec, fileBytes);

  const available = new Set(
    [...files.entries, ...(swap.files?.entries ?? [])]
      .filter((entry) => storage.hasBlob(vaultId, entry.blobHash))
      .map((entry) => base32(entry.blobHash)),
  );

  const result = validateSwap(swap, {
    previous,
    state,
    files,
    requestSigner: auth.request.device,
    missingBlobs: new Set(
      files.entries
        .filter((e) => !available.has(base32(e.blobHash)))
        .map((e) => base32(e.blobHash)),
    ),
    ancestorHeaderHashes: new Set(
      swap.entries.flatMap((entry) =>
        entry.body.kind === 6 && storage.header(vaultId, entry.body.payload.restoredHead)
          ? [base32(entry.body.payload.restoredHead)]
          : [],
      ),
    ),
    repairRegistrationRequired: repairLoginDecision(repairHistory(options, vaultId)) === "register",
    ...(!storage.vault(vaultId)!.active
      ? { destinationPin: serverPin(options.serverKeys.publicKey) }
      : {}),
  });

  if (result.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid swap");

  return { result, files, available };
}
