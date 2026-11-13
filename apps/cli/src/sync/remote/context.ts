import { vaultConnection } from "../../vault/connection.ts";
import { readConfig } from "../../settings/config.ts";
import * as p from "@envden/core/protocol";
import { verifyChain } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { ISyncOptions } from "../model.ts";
import { loadState } from "../../state/store/repository.ts";
import { binary } from "../../client/encoding.ts";
import { VERSION } from "../../version.ts";

export async function syncContext(adapters: TAdapters, options: ISyncOptions) {
  const state = await loadState(adapters.home);

  if (!state?.server || !state.vaultId || !state.checkpoint || !state.files || !state.keyring)
    throw new EnvdenError("NOT_FOUND", "Run envden setup or join first");

  const config = await readConfig(adapters.home);

  if (state.release?.unsafe.includes(VERSION) && config["allow-version"] !== VERSION)
    throw new EnvdenError("UNSAFE_VERSION", "Update envden before syncing");

  const { identity, vaultId, client } = await vaultConnection(
    adapters,
    { ...state, server: state.server, vaultId: state.vaultId },
    options.now,
    options.fetcher,
  );

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
    adapters,
    options,
    state,
    identity,
    vaultId,
    client,
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

export type TSyncContext = Awaited<ReturnType<typeof syncContext>>;
