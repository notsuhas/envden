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

    await rm(join(adapters.home, "state", "approve-swap"), { force: true });

    throw new EnvdenError(
      "CONFLICT",
      "The join request expired; run envden join on the new device again",
      {
        cause: error,
      },
    );
  }
}

export async function submitApproval(adapters: TAdapters, client: TClient, vaultId: Uint8Array) {
  const path = join(adapters.home, "state", "approve-swap");
  const saved = await optionalRead(path);
  if (!saved) return false;
  const [request, encoded] = saved.split(":");

  if (!request || !/^[1-9]\d{0,2}$/.test(request) || !encoded)
    throw new EnvdenError("INVALID_DATA", "Invalid stored approval swap");

  const bytes = binary(encoded);
  const swap = p.decode(p.SwapCodec, bytes);
  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");
  const history = await readHistory(client, vaultId);

  if (!historyHasHeader(history, hash))
    await client.request(`/v1/swap?request=${request}`, "POST", bytes);

  const verified = await readHistory(client, vaultId);

  if (!historyHasHeader(verified, hash))
    throw new EnvdenError("INVALID_DATA", "Server did not commit the approval swap");

  await rm(path, { force: true });

  return true;
}

export async function saveApproval(adapters: TAdapters, request: number, bytes: Uint8Array) {
  await atomicWrite(
    join(adapters.home, "state", "approve-swap"),
    `${request}:${text(bytes)}`,
    adapters.now,
  );
}
