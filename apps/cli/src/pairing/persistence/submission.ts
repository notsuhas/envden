import { historyHasHeader } from "../../vault/join/validation.ts";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TClient } from "../../client/request.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { binary, text } from "../../client/encoding.ts";
import { readHistory } from "../../vault/history.ts";
import { isStaleSwapError } from "./stale.ts";

export async function resumeApproval(adapters: TAdapters, client: TClient, vaultId: Uint8Array) {
  try {
    return await submitApproval(adapters, client, vaultId);
  } catch (error) {
    if (!isStaleSwapError(error)) throw error;

    await rm(join(adapters.home, "state", "pair-swap"), { force: true });

    throw new EnvdenError("CONFLICT", "Pairing approval expired; run envden device add again", {
      cause: error,
    });
  }
}

export async function submitApproval(adapters: TAdapters, client: TClient, vaultId: Uint8Array) {
  const path = join(adapters.home, "state", "pair-swap");
  const saved = await optionalRead(path);
  if (!saved) return false;
  const [mailbox, encoded] = saved.split(":");

  if (!mailbox || !/^[1-9]\d{0,2}$/.test(mailbox) || !encoded)
    throw new EnvdenError("INVALID_DATA", "Invalid stored pairing swap");

  const bytes = binary(encoded);
  const swap = p.decode(p.SwapCodec, bytes);
  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");
  const history = await readHistory(client, vaultId);

  if (!historyHasHeader(history, hash))
    await client.request(`/v1/swap?mailbox=${mailbox}`, "POST", bytes);

  const verified = await readHistory(client, vaultId);

  if (!historyHasHeader(verified, hash))
    throw new EnvdenError("INVALID_DATA", "Server did not commit the pairing swap");

  await rm(path, { force: true });

  return true;
}

export async function saveApproval(adapters: TAdapters, mailbox: number, bytes: Uint8Array) {
  await atomicWrite(
    join(adapters.home, "state", "pair-swap"),
    `${mailbox}:${text(bytes)}`,
    adapters.now,
  );
}
