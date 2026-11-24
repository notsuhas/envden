import { operationSwap } from "./operation-objects.ts";
import { operationEntries } from "./operation-entries.ts";
import {
  base32 as idForTest,
  generateRecoveryKeys,
  recoveryId,
  signObject,
  ManifestHeaderCodec,
  objectHash,
} from "../../protocol/index.ts";
import type { ISigned, TEntry } from "../../protocol/index.ts";
import { applyEntry } from "../devices/apply.ts";
import { bytes, device, fixture, rng } from "./fixtures.ts";

export function swapFixture(op: number) {
  const f = fixture();
  let entries: ISigned<TEntry>[] = [];
  let state = f.state;
  const nextRecoveryKeys = generateRecoveryKeys(rng(42));
  const nextRecovery = { ...nextRecoveryKeys, id: recoveryId(nextRecoveryKeys) };
  const removed = device(12);

  if (op === 4 || op === 5) {
    const add = f.entry(state, {
      kind: 1,
      payload: {
        device: removed.record,
        wrap: { recipient: removed.record.id, enc: bytes(1), ct: bytes(2, 48) },
      },
    });

    const result = applyEntry(state, add);
    if (result.kind !== "valid") throw new Error("fixture add");
    state = result.state;
  }

  const previous = signObject(
    ManifestHeaderCodec,
    { ...f.header.body, listSeq: state.seq, listHead: state.head },
    f.a.keys.objSk,
    "manifest",
  );

  entries = operationEntries(op, f, state, previous, removed, nextRecovery);

  let nextState = state;

  for (const e of entries) {
    const result = applyEntry(nextState, e);
    if (result.kind !== "valid") throw new Error("fixture apply");
    nextState = result.state;
  }

  const { swap, prior, oldFiles, oldEntry, header } = operationSwap(
    op,
    f,
    state,
    nextState,
    previous,
    entries,
  );

  return {
    ...f,
    swap,
    context: {
      previous: prior,
      state,
      files: oldFiles,
      requestSigner: header.body.signer,
      missingBlobs: new Set([idForTest(oldEntry.blobHash)]),
      ancestorHeaderHashes: new Set([
        idForTest(objectHash(ManifestHeaderCodec, previous, "manifest")),
      ]),
    },
  };
}
