import { validateSwap } from "@envden/core/chain";
import { decode, FilesCodec, base32, serverPin, type ISwap } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { vaultChain } from "../chain.ts";

export function validateForCommit(options: IAppOptions, auth: IAuth, swap: ISwap) {
  const { storage } = options;
  const { vaultId } = auth.request;
  const { header: previous, state } = vaultChain(storage, vaultId);
  const fileBytes = storage.fileList(vaultId, previous.body.filesHash);
  if (!fileBytes) throw new EnvdenError("INVALID_DATA", "Missing head file list");
  const files = decode(FilesCodec, fileBytes);

  const old = new Set(
    files.entries
      .filter((entry) => [1, 3].includes(entry.state))
      .map((entry) => base32(entry.blobHash)),
  );

  const candidates =
    swap.header.body.op === 11
      ? [...files.entries, ...(swap.files?.entries ?? [])]
      : (swap.files?.entries ?? []).filter((entry) => !old.has(base32(entry.blobHash)));

  const available = new Set<string>();
  const checked = new Set<string>();

  for (const entry of candidates) {
    const hash = base32(entry.blobHash);
    if (checked.has(hash)) continue;
    checked.add(hash);
    if (storage.hasBlob(vaultId, entry.blobHash)) available.add(hash);
  }

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
    ...(!storage.vault(vaultId)!.active
      ? { destinationPin: serverPin(options.serverKeys.publicKey) }
      : {}),
  });

  if (result.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid swap");

  return { result, files, available };
}
