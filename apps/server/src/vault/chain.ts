import { verifyChain, type IDeviceListState } from "@envden/core/chain";
import {
  decode,
  signedCodec,
  EntryCodec,
  ManifestHeaderCodec,
  base32,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IStorageAdapter } from "@envden/core/adapters";

const caches = new WeakMap<
  IStorageAdapter,
  Map<string, { head: string; state: IDeviceListState }>
>();

export function vaultChain(storage: IStorageAdapter, vault: Uint8Array) {
  const head = storage.head(vault);
  if (!head) throw new EnvdenError("NOT_FOUND", "Missing head");
  const header = decode(signedCodec(ManifestHeaderCodec), storage.header(vault, head)!.bytes);
  let cache = caches.get(storage);

  if (!cache) {
    cache = new Map();
    caches.set(storage, cache);
  }

  const cached = cache.get(base32(vault));
  if (cached?.head === base32(head)) return { header, state: cached.state };

  const result = verifyChain(
    storage
      .entries(vault, 0n, header.body.listSeq)
      .map((e) => decode(signedCodec(EntryCodec), e.bytes)),
  );

  if (result.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid stored chain");
  cache.set(base32(vault), { head: base32(head), state: result.state });

  return { header, state: result.state };
}

export function membership(storage: IStorageAdapter, vault: Uint8Array, device: Uint8Array) {
  if (!storage.head(vault)) return undefined;

  return vaultChain(storage, vault).state.devices.get(base32(device));
}
