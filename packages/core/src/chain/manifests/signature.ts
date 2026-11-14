import { EnvdenError } from "../../errors/index.ts";
import { ManifestHeaderCodec, equal, verifyObject } from "../../protocol/index.ts";
import type { IManifestHeader, ISigned, TEntry } from "../../protocol/index.ts";
import type { IDeviceListState } from "../devices/state.ts";
import { applyEntry, verifyChain } from "../devices/apply.ts";
import { check, id } from "../shared/validation.ts";
import { entryDescent } from "./descent.ts";
import type { IChainSource } from "./source.ts";

export async function checkHeaderSignature(
  source: IChainSource,
  verified: IDeviceListState,
  signed: ISigned<IManifestHeader>,
): Promise<void> {
  const h = signed.body;
  check(equal(h.vaultId, verified.vaultId));
  let state = verified;

  if (h.listSeq >= state.seq) {
    try {
      for (const entry of await entryDescent(source, state, h)) {
        const result = applyEntry(state, entry);
        check(result.kind === "valid");
        state = result.state;
      }
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "INVALID_DATA") throw error;
      state = await stateFromGenesis(source, h);
    }
  } else {
    state = await stateFromGenesis(source, h);
  }

  check(equal(state.vaultId, h.vaultId) && equal(state.head, h.listHead));
  const signer = state.devices.get(id(h.signer));
  check(signer && verifyObject(ManifestHeaderCodec, signed, signer.objPub, "manifest").ok);
}

async function stateFromGenesis(source: IChainSource, h: IManifestHeader) {
  const entries: ISigned<TEntry>[] = [];
  let hash = h.listHead;

  for (let seq = h.listSeq; seq >= 0n; seq--) {
    const entry = await source.entry(hash);
    check(entry && entry.body.seq === seq);
    entries.unshift(entry);
    hash = entry.body.parent;
  }

  const result = verifyChain(entries);
  check(result.kind === "valid");

  return result.state;
}
