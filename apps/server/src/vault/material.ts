import { EnvdenError } from "@envden/core/errors";
import { storedVersions } from "./versions.ts";
import type { IStoredSwap } from "@envden/core/adapters";
import {
  EntryCodec,
  ManifestHeaderCodec,
  FilesCodec,
  signedCodec,
  objectHash,
  H,
  type ISwap,
} from "@envden/core/protocol";

export function storedSwap(swap: ISwap, digest: Uint8Array): IStoredSwap {
  const h = swap.header.body;
  // PROTOCOL sections 2 and 4: box overhead, keyring fields, then one 36-byte key per prior epoch.
  const keyringLimit = 1 + 24 + 16 + 2 + 32 + 4 + 32 + 4 + 36 * (h.epoch - 1);

  if (swap.keyring && swap.keyring.length > keyringLimit)
    throw new EnvdenError("INVALID_DATA", "Keyring exceeds epoch history size");

  const state: NonNullable<IStoredSwap["state"]> = [];
  if (swap.keyring) state.push({ kind: "keyring", key: h.keyringHash, bytes: swap.keyring });
  if (swap.envelope) state.push({ kind: "envelope", key: new Uint8Array(), bytes: swap.envelope });
  if (swap.proofPub) state.push({ kind: "proofPub", key: new Uint8Array(), bytes: swap.proofPub });

  return {
    header: {
      seq: h.seq,
      hash: objectHash(ManifestHeaderCodec, swap.header, "manifest"),
      bytes: signedCodec(ManifestHeaderCodec).write(swap.header),
    },
    entries: swap.entries.map((e) => ({
      seq: e.body.seq,
      hash: objectHash(EntryCodec, e, "entry"),
      bytes: signedCodec(EntryCodec).write(e),
    })),
    filesHash: h.filesHash,
    bodyDigest: digest,
    state,
    ...(swap.files
      ? {
          files: {
            hash: H("files", FilesCodec.write(swap.files)),
            bytes: FilesCodec.write(swap.files),
            retainForever: h.op === 11,
            versions: storedVersions(swap.files.entries),
          },
        }
      : {}),
  };
}
