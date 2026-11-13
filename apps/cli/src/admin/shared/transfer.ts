import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../../client/request.ts";
import type { THistory } from "../../vault/history.ts";
import { text } from "../../client/encoding.ts";

export async function optionalObject(client: TClient, path: string) {
  try {
    return new Uint8Array(await (await client.request(path)).arrayBuffer());
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "NOT_FOUND") return undefined;
    throw error;
  }
}

export async function historySwaps(
  history: THistory,
  files: (hash: Uint8Array) => Promise<Uint8Array | undefined>,
  after = 0n,
): Promise<p.ISwap[]> {
  const swaps: p.ISwap[] = [];
  let listSeq = -1n;

  for (const header of history.headers) {
    if (header.body.seq <= after) {
      listSeq = header.body.listSeq;
      continue;
    }

    const body = await files(header.body.filesHash);

    if (body && !p.equal(p.H("files", body), header.body.filesHash))
      throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

    swaps.push({
      expectedHead: header.body.prev,
      header,
      entries: history.entries.filter(
        (e) => e.body.seq > listSeq && e.body.seq <= header.body.listSeq,
      ),
      files: body ? p.decode(p.FilesCodec, body) : undefined,
      keyring: undefined,
      envelope: undefined,
      skPub: undefined,
      opaqueRecord: undefined,
      approver: undefined,
    });

    listSeq = header.body.listSeq;
  }

  return swaps;
}

export async function copyServer(source: TClient, destination: TClient, history: THistory) {
  const hashes = p.ObjectsResponseSchema.parse(
    await (await source.request("/v1/blobs")).json(),
  ).objects;

  for (const hash of hashes) {
    const bytes = await optionalObject(source, `/v1/blobs/${hash}`);

    if (!bytes || text(p.H("blob", bytes)) !== hash)
      throw new EnvdenError("INVALID_DATA", "Move blob hash mismatch");

    await destination.request(`/v1/blobs/${hash}`, "PUT", bytes);
  }

  const swaps = await historySwaps(history, (hash) =>
    optionalObject(source, `/v1/files/${text(hash)}`),
  );

  await destination.request("/v1/move/chain", "POST", p.encode(p.list(p.SwapCodec), swaps));

  for (const header of history.headers) {
    const hash = header.body.keyringHash;
    const bytes = await optionalObject(source, `/v1/keyrings/${text(hash)}`);
    if (bytes) await destination.request(`/v1/move/material/keyring/${text(hash)}`, "PUT", bytes);
  }

  const envelope = await optionalObject(source, "/v1/envelope");
  const head = history.headers.at(-1)!;

  if (!envelope || !p.equal(p.H("envelope-blob", envelope), head.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Move envelope hash mismatch");

  await destination.request(
    `/v1/move/material/envelope/${text(head.body.envelopeHash)}`,
    "PUT",
    envelope,
  );

  const skPub = await optionalObject(source, "/v1/move/sk-pub");
  if (!skPub) throw new EnvdenError("INVALID_DATA", "Missing secret key public key");

  await destination.request(
    `/v1/move/material/skPub/${text(p.H("sk-public", skPub))}`,
    "PUT",
    skPub,
  );

  const period = p.UnlockPeriodSchema.parse(await (await source.request("/v1/move/period")).json());
  await destination.request("/v1/move/period", "PUT", period);
}
