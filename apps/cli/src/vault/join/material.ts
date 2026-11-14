import * as p from "@envden/core/protocol";
import { verifyChain } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { binary } from "../../client/encoding.ts";

export async function checkpointMaterial(adapters: TAdapters, state: ILocalState) {
  if (!state.checkpoint || !state.files || !state.keyring || !state.vaultId)
    throw new EnvdenError("INVALID_DATA", "Missing checkpoint material");

  const vaultId = p.unbase32(state.vaultId);

  const headers = state.headers.map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const header = headers.find((item) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(state.checkpoint!)),
  );

  const entries = state.entries.map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), binary(value)),
  );

  if (!header) throw new EnvdenError("INVALID_DATA", "Missing checkpoint header");

  const chain =
    state.verifiedState?.seq === header.body.listSeq
      ? { kind: "valid" as const, state: state.verifiedState }
      : verifyChain(entries.filter((item) => item.body.seq <= header.body.listSeq));

  const idKey = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  const key = await adapters.keychain.get(`envden/${adapters.home}/epoch/${header.body.epoch}`);

  if (chain.kind !== "valid" || !idKey || !key)
    throw new EnvdenError("LOCKED", "Vault keys unavailable");

  const ring = p.openKeyring(
    binary(state.keyring),
    key,
    vaultId,
    header.body.epoch,
    chain.state.commits,
    idKey,
  );

  const keys = new Map(ring.older.map((item) => [item.epoch, item.key]));
  keys.set(header.body.epoch, key);

  return {
    headers,
    entries,
    keys,
    checkpoint: {
      header,
      files: p.decode(p.FilesCodec, binary(state.files)),
      state: chain.state,
      idKey,
    },
  };
}
