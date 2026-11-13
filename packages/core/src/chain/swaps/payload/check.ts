import type { ISwapContext } from "../context.ts";
import { equal, H, validateEdPublic, OPAQUE_LENGTHS } from "../../../protocol/index.ts";
import type { ISwap } from "../../../protocol/index.ts";
import { changedFiles, checkedFiles } from "../../manifests/files.ts";
import { check, id } from "../../shared/validation.ts";

export function checkPayload(swap: ISwap, context: ISwapContext) {
  const h = swap.header.body;
  const previous = context.previous.body;
  const op = h.op;
  const done = swap.entries[0]?.body;

  if (done?.kind === 6)
    check(
      equal(done.payload.restoredHead, swap.expectedHead) ||
        context.ancestorHeaderHashes.has(id(done.payload.restoredHead)),
    );

  check((swap.files !== undefined) === [1, 11].includes(op));
  check((swap.keyring !== undefined) === [4, 5, 6, 7, 9].includes(op));
  check((swap.envelope !== undefined) === [5, 7, 8, 9].includes(op));
  check((swap.skPub !== undefined) === [5, 7].includes(op));

  check(
    (swap.opaqueRecord !== undefined) ===
      ([8, 9].includes(op) || (op === 12 && context.repairRegistrationRequired)),
  );

  check((swap.approver !== undefined) === (op === 2));
  if (swap.skPub) validateEdPublic(swap.skPub);
  if (swap.opaqueRecord) check(swap.opaqueRecord.length === OPAQUE_LENGTHS.registrationRecord);
  if (swap.approver) check(swap.approver.length <= 4096);

  if (swap.keyring) check(equal(H("keyring-blob", swap.keyring), h.keyringHash));
  if (swap.envelope) check(equal(H("envelope-blob", swap.envelope), h.envelopeHash));

  if (swap.files) {
    checkedFiles(context.files, previous.filesHash);

    const changed = changedFiles(
      context.files,
      checkedFiles(swap.files, h.filesHash),
      previous.epoch,
      h.epoch,
      op,
    );

    if (op === 11) {
      const old = new Map(context.files.entries.map((e) => [id(e.fileId), e]));
      check(changed.every((e) => context.missingBlobs.has(id(old.get(id(e.fileId))!.blobHash))));
    }
  }
}
