import { prepareMove } from "./move.ts";
import { validateForCommit } from "./validate.ts";
import { refundRegistration } from "../../auth/staged.ts";
import type { IFiles } from "@envden/core/protocol";
import { base32, equal, type ISwap } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { membership } from "../chain.ts";
import { storedSwap } from "../material.ts";
import { authorizeSwap } from "../authorization.ts";
import { closeRepair } from "../../repair/close.ts";

export function commit(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  digest: Uint8Array,
  mailbox?: number,
) {
  const { storage, now } = options;
  const { vaultId } = auth.request;
  auth = { ...auth, member: !!membership(storage, vaultId, auth.request.device) };
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

  const { result, files, available } = validateForCommit(options, auth, swap);

  if (vault.restored && ![4, 11, 12].includes(swap.header.body.op))
    throw new EnvdenError("RESTORED_MODE", "Repair required");

  authorizeSwap(options, auth, swap, result.authorization, stored, mailbox);

  requireUploadedBlobs(files, swap, available);

  if (swap.header.body.op === 12) closeRepair(options, auth, swap, stored);
  if (swap.skPub) stored.vault = { ...vault, skRefused: false };

  prepareMove(options, auth, swap, stored, result.state.serverPin);

  const registrant = vault.active
    ? auth.request.device
    : storage.state(vaultId, "move-session", new Uint8Array());

  const committed = storage.commitSwap(vaultId, swap.expectedHead, stored, now());

  if (committed.kind === "committed" && registrant && (swap.opaqueRecord || !vault.active))
    refundRegistration(options, vaultId, registrant);

  return committed;
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
