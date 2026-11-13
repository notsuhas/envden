import type { IStoredSwap } from "@envden/core/adapters";
import type { IFiles } from "@envden/core/protocol";
import { validateSwap, repairLoginDecision } from "@envden/core/chain";
import { decode, FilesCodec, base32, equal, serverPin, type ISwap } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { vaultChain } from "../chain.ts";
import { storedSwap } from "../material.ts";
import { authorizeSwap } from "../authorization.ts";
import { closeRepair, repairHistory } from "../../repair/close.ts";

export function commit(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  digest: Uint8Array,
  mailbox?: number,
) {
  const { storage, now } = options;
  const { vaultId } = auth.request;
  const stored = storedSwap(swap, digest);
  if (!storage.head(vaultId)) throw new EnvdenError("MOVING", "Import required");
  if (storage.findCommitted(vaultId, digest)) return { kind: "retry-of-committed" as const };
  const vault = storage.vault(vaultId)!;

  if (
    vault.serverMoved ||
    (vault.frozen && swap.header.body.op !== 10) ||
    (!vault.active && swap.header.body.op !== 10)
  )
    throw new EnvdenError("MOVING", "Vault moving");

  if (!equal(storage.head(vaultId)!, swap.expectedHead))
    return { kind: "head-moved" as const, head: storage.head(vaultId)! };

  const { header: previous, state } = vaultChain(storage, vaultId);
  const files = decode(FilesCodec, storage.fileList(vaultId, previous.body.filesHash)!);

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
    ...(!vault.active ? { destinationPin: serverPin(options.serverKeys.publicKey) } : {}),
  });

  if (result.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid swap");

  if (vault.restored && ![4, 11, 12].includes(swap.header.body.op))
    throw new EnvdenError("RESTORED_MODE", "Repair required");

  authorizeSwap(options, auth, swap, result.authorization, stored, mailbox);

  requireUploadedBlobs(files, swap, available);

  if (swap.header.body.op === 12) closeRepair(options, auth, swap, stored);
  if (swap.skPub) stored.vault = { ...vault, skRefused: false };

  prepareMove(options, auth, swap, stored, result.state.serverPin);

  return storage.commitSwap(vaultId, swap.expectedHead, stored, now());
}

function requireUploadedBlobs(files: IFiles, swap: ISwap, available: Set<string>) {
  const old = new Set(
    files.entries.filter((e) => [1, 3].includes(e.state)).map((e) => base32(e.blobHash)),
  );

  if (
    swap.files?.entries.some(
      (e) =>
        [1, 3].includes(e.state) &&
        !old.has(base32(e.blobHash)) &&
        !available.has(base32(e.blobHash)),
    )
  )
    throw new EnvdenError("INVALID_DATA", "Missing uploaded blob");
}

function prepareMove(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  stored: IStoredSwap,
  destination: Uint8Array,
) {
  const { storage } = options;
  const { vaultId } = auth.request;
  const vault = storage.vault(vaultId)!;

  if (swap.header.body.op === 10 && !vault.active) {
    const record = storage.state(vaultId, "move-session", new TextEncoder().encode("registration"));
    if (!record) throw new EnvdenError("UNAUTHORIZED", "Move registration required");

    stored.state!.push(
      { kind: "opaqueRecord", key: new Uint8Array(), bytes: record },
      { kind: "move-session", key: new Uint8Array() },
      { kind: "move-session", key: new TextEncoder().encode("registration") },
    );
  }

  if (swap.header.body.op === 10)
    stored.vault = vault.active
      ? { ...vault, frozen: true, serverMoved: destination }
      : { ...vault, active: true, frozen: false };
}
