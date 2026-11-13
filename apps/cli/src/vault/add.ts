import { applyEntry } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import * as p from "@envden/core/protocol";
import type { THistory } from "./history.ts";

export async function addDeviceSwap(
  history: THistory,
  device: p.IDeviceRecord,
  signer: Uint8Array,
  objSk: Uint8Array,
  epochKey: Uint8Array,
  op: 2 | 3,
  now: number,
  headerSigner: { id: Uint8Array; sk: Uint8Array },
): Promise<p.ISwap> {
  const before = history.headers.at(-1)!;
  const state = history.state;
  const wrap = await p.sealWrap(epochKey, state.vaultId, state.epoch, device.id, device.encPub);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: state.vaultId,
      seq: state.seq + 1n,
      parent: state.head,
      kind: 1,
      payload: { device, wrap },
      signer,
    },
    objSk,
    "entry",
  );

  if (applyEntry(state, entry).kind !== "valid")
    throw new EnvdenError("CONFLICT", "Device name or keys cannot be added");

  const expectedHead = p.objectHash(p.ManifestHeaderCodec, before, "manifest");

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...before.body,
      seq: before.body.seq + 1n,
      prev: expectedHead,
      op,
      listSeq: state.seq + 1n,
      listHead: p.objectHash(p.EntryCodec, entry, "entry"),
      createdAt: BigInt(now),
      signer: headerSigner.id,
    },
    headerSigner.sk,
    "manifest",
  );

  return {
    expectedHead,
    entries: [entry],
    header,
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    skPub: undefined,
    opaqueRecord: undefined,
    approver: undefined,
  };
}
