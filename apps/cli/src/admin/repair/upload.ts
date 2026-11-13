import { withStateLock } from "../../state/lock/lock.ts";
import { localRepairChain } from "./chain.ts";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import { isReusedRepairToken } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { binary, text } from "../../client/encoding.ts";
import { readHistory } from "../../vault/history.ts";
import { adminContext } from "../shared/context.ts";
import { checkFloor } from "../shared/history.ts";
import { historySwaps } from "../shared/transfer.ts";

async function cachedBytes(path: string) {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function repairContext(
  adapters: TAdapters,
  tokenText: string,
  now: () => number,
  fetcher: TFetch,
) {
  const token = p.decodeToken("repair", tokenText);

  const context = await adminContext(adapters, now, fetcher, (request) =>
    p.tokenProof("repair", p.tokenKey("repair", token.secret), request),
  );

  if (!context.local.server || !p.equal(binary(context.local.server.pin), token.serverPin))
    throw new EnvdenError("INVALID_INPUT", "Repair token is for another server");

  const { chain } = localRepairChain(context.local.entries);
  const repairId = p.H("repair-id", token.secret);

  if (chain.kind !== "valid" || isReusedRepairToken(repairId, chain.state.repairIds))
    throw new EnvdenError("INVALID_DATA", "Repair token was already used");

  return { ...context, repairId };
}

async function lockeduploadRepair(
  adapters: TAdapters,
  token: string,
  now: () => number,
  fetcher: TFetch = fetch,
) {
  const context = await repairContext(adapters, token, now, fetcher);
  const remote = await readHistory(context.client, context.vaultId);

  const headers = context.local.headers.map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const { entries, chain } = localRepairChain(context.local.entries);
  if (chain.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid stored chain");
  const stored = { headers, entries, state: chain.state };
  const remoteHead = remote.headers.at(-1)!;
  const localHead = headers.at(-1)!;

  if (localHead.body.seq > remoteHead.body.seq)
    checkFloor(
      {
        ...context.local,
        headers: remote.headers.map((h) => text(p.signedCodec(p.ManifestHeaderCodec).write(h))),
      },
      stored,
    );
  else checkFloor(context.local, remote);

  const files = context.local.files
    ? p.decode(p.FilesCodec, binary(context.local.files))
    : { entries: [] };

  const blobs = await uploadCachedBlobs(context, files);

  if (localHead.body.seq > remoteHead.body.seq) {
    const swaps = await historySwaps(
      stored,
      async (hash) => {
        if (context.local.files && p.equal(p.H("files", binary(context.local.files)), hash))
          return binary(context.local.files);

        return cachedBytes(join(adapters.home, "state", "file-lists", text(hash)));
      },
      remoteHead.body.seq,
    );

    await context.client.request("/v1/repair/chain", "POST", p.encode(p.list(p.SwapCodec), swaps));
  }

  if (context.local.keyring)
    await context.client.request(
      `/v1/repair/material/keyring/${text(localHead.body.keyringHash)}`,
      "PUT",
      binary(context.local.keyring),
    );

  const envelope = await cachedBytes(join(adapters.home, "state", "envelope.bin"));

  const repaired = await readHistory(context.client, context.vaultId);

  if (
    envelope &&
    p.equal(p.H("envelope-blob", envelope), repaired.headers.at(-1)!.body.envelopeHash)
  )
    await context.client.request(
      `/v1/repair/material/envelope/${text(p.H("envelope-blob", envelope))}`,
      "PUT",
      envelope,
    );

  const history = await readHistory(context.client, context.vaultId);
  blobs.sort(p.compare);

  const report = p.signObject(
    p.RepairReportCodec,
    {
      vaultId: context.vaultId,
      repairId: context.repairId,
      head: p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
      blobs,
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "repair-report",
  );

  await context.client.request(
    "/v1/repair/report",
    "PUT",
    p.signedCodec(p.RepairReportCodec).write(report),
  );

  return context;
}

export function uploadRepair(...args: Parameters<typeof lockeduploadRepair>) {
  return withStateLock(args[0].home, () => lockeduploadRepair(...args));
}

async function uploadCachedBlobs(
  context: Awaited<ReturnType<typeof repairContext>>,
  files: p.IFiles,
) {
  const adapters = context.adapters;
  const blobs: Uint8Array[] = [];

  for (const file of files.entries) {
    if (![1, 3].includes(file.state)) continue;
    const bytes = await cachedBytes(join(adapters.home, "state", "blobs", text(file.blobHash)));
    if (!bytes) continue;

    if (!p.equal(p.H("blob", bytes), file.blobHash))
      throw new EnvdenError("INVALID_DATA", "Cached blob hash mismatch");

    await context.client.request(`/v1/blobs/${text(file.blobHash)}`, "PUT", bytes);
    blobs.push(file.blobHash);
  }

  return blobs;
}
