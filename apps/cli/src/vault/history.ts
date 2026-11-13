import * as p from "@envden/core/protocol";
import { verifyChain } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../client/request.ts";
import { binary } from "../client/encoding.ts";

async function objects(client: TClient, path: string): Promise<string[]> {
  const value: unknown = await (await client.request(path)).json();

  if (
    !value ||
    typeof value !== "object" ||
    !("objects" in value) ||
    !Array.isArray(value.objects) ||
    !value.objects.every((item: unknown) => typeof item === "string")
  )
    throw new EnvdenError("INVALID_DATA", "Invalid history response");

  return value.objects;
}

export async function readHistory(client: TClient, vaultId: Uint8Array) {
  const entries = (await objects(client, "/v1/entries")).map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), binary(value)),
  );

  const headers = (await objects(client, "/v1/headers")).map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const chain = verifyChain(entries);

  if (chain.kind !== "valid" || !p.equal(chain.state.vaultId, vaultId) || headers.length === 0)
    throw new EnvdenError("INVALID_DATA", "Invalid vault history");

  let previous: Uint8Array = new Uint8Array(32);
  let previousEpoch = 0;

  for (let index = 0; index < headers.length; index++) {
    const signed = headers[index]!;
    const h = signed.body;
    const at = verifyChain(entries.filter((entry) => entry.body.seq <= h.listSeq));
    if (at.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid device list");
    const signer = at.state.devices.get(p.base32(h.signer));

    if (
      !signer ||
      !p.equal(h.vaultId, vaultId) ||
      h.seq !== BigInt(index + 1) ||
      !p.equal(h.prev, previous) ||
      !p.equal(h.listHead, at.state.head) ||
      h.epoch !== at.state.epoch ||
      h.epoch < previousEpoch ||
      !p.verifyObject(p.ManifestHeaderCodec, signed, signer.objPub, "manifest").ok
    )
      throw new EnvdenError("INVALID_DATA", "Invalid manifest history");

    previous = p.objectHash(p.ManifestHeaderCodec, signed, "manifest");
    previousEpoch = h.epoch;
  }

  const final = headers.at(-1)!.body;

  if (final.listSeq !== chain.state.seq || !p.equal(final.listHead, chain.state.head))
    throw new EnvdenError("INVALID_DATA", "Uncommitted device list entries");

  return { entries, headers, state: chain.state };
}

export type THistory = Awaited<ReturnType<typeof readHistory>>;
