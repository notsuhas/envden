import type { IDeviceListState } from "../devices/state.ts";
import type { TEntry } from "../../protocol/index.ts";
import {
  equal,
  H,
  ManifestHeaderCodec,
  objectHash,
  openKeyring,
  verifyObject,
} from "../../protocol/index.ts";
import type { IFileEntry, IManifestHeader, ISigned } from "../../protocol/index.ts";
import { applyEntry } from "../devices/apply.ts";
import { operationRequirement } from "../swaps/operation.ts";
import { check, id } from "../shared/validation.ts";
import { checkHeaderSignature } from "./signature.ts";
import { changedFiles, checkedFiles } from "./files.ts";
import { entryDescent, headerDescent } from "./descent.ts";
import type { IChainSource, ICheckpoint } from "./source.ts";

export type TManifestResult =
  | {
      kind: "accepted";
      checkpoint: ICheckpoint;
      headers: ISigned<IManifestHeader>[];
      repairs: IFileEntry[];
      noFastForward: ReadonlySet<string>;
    }
  | { kind: "unchanged" | "rollback" | "fork" | "invalid" };

export async function acceptManifest(input: {
  checkpoint: ICheckpoint;
  head: ISigned<IManifestHeader>;
  storedHeaders: readonly ISigned<IManifestHeader>[];
  source: IChainSource;
  localFileIds: ReadonlySet<string>;
}): Promise<TManifestResult> {
  try {
    const { checkpoint: c, head, source } = input;
    const hash = (h: ISigned<IManifestHeader>) => objectHash(ManifestHeaderCodec, h, "manifest");

    const prior = priorManifest(c, head, input.storedHeaders);

    if (prior.kind !== "advance") {
      if (prior.kind === "fork") await checkHeaderSignature(source, c.state, head);

      return prior;
    }

    const headers = await headerDescent(source, c.header, head, (header) =>
      checkHeaderSignature(source, c.state, header),
    );

    if (!headers) return { kind: "fork" };
    let state = c.state;
    let previous = c.header;
    const known = new Set(input.storedHeaders.map((h) => id(hash(h))));
    known.add(id(hash(c.header)));
    const repairs: IFileEntry[] = [];
    const noFastForward = new Set<string>();
    checkedFiles(c.files, c.header.body.filesHash);

    for (const signed of headers) {
      const h = signed.body;
      check(equal(h.vaultId, state.vaultId));
      const stored = input.storedHeaders.find((item) => item.body.seq === h.seq);

      if (stored && !equal(hash(stored), hash(signed))) {
        await checkHeaderSignature(source, state, signed);

        return { kind: "fork" };
      }

      state = await advanceHeader(source, state, previous, signed, known);

      const changes = await repairChanges(c, previous, signed, source);
      repairs.push(...changes);

      for (const entry of changes)
        if (input.localFileIds.has(id(entry.fileId))) noFastForward.add(id(entry.fileId));

      known.add(id(hash(signed)));
      previous = signed;
    }

    const files = checkedFiles(await source.files(head.body.filesHash), head.body.filesHash);
    changedFiles(c.files, files, c.header.body.epoch, head.body.epoch);

    await verifyKeyring(source, c, head, state);

    return {
      kind: "accepted",
      checkpoint: { header: head, files, state, idKey: c.idKey },
      headers,
      repairs,
      noFastForward,
    };
  } catch {
    return { kind: "invalid" };
  }
}

async function repairChanges(
  c: ICheckpoint,
  previous: ISigned<IManifestHeader>,
  signed: ISigned<IManifestHeader>,
  source: IChainSource,
): Promise<IFileEntry[]> {
  const h = signed.body;

  if (h.op === 1 || h.op === 11) {
    const old = equal(previous.body.filesHash, c.header.body.filesHash)
      ? c.files
      : await source.files(previous.body.filesHash);

    const next = await source.files(h.filesHash);

    if (h.op === 11 || (old && next)) {
      const changes = changedFiles(
        checkedFiles(old, previous.body.filesHash),
        checkedFiles(next, h.filesHash),
        previous.body.epoch,
        h.epoch,
        h.op,
      );

      if (h.op === 11) return changes;
    }
  }

  return [];
}

function applyEntries(state: IDeviceListState, entries: readonly ISigned<TEntry>[]) {
  for (const entry of entries) {
    const result = applyEntry(state, entry);
    check(result.kind === "valid");
    state = result.state;
  }

  return state;
}

async function advanceHeader(
  source: IChainSource,
  state: IDeviceListState,
  previous: ISigned<IManifestHeader>,
  signed: ISigned<IManifestHeader>,
  known: Set<string>,
) {
  const h = signed.body;
  const entries = await entryDescent(source, state, h);
  const before = state;

  state = applyEntries(state, entries);

  const signer = state.devices.get(id(h.signer));
  check(signer && verifyObject(ManifestHeaderCodec, signed, signer.objPub, "manifest").ok);
  operationRequirement(previous.body, h, entries, before);
  check(h.epoch === state.epoch);

  for (const entry of entries) {
    if (entry.body.kind === 6) check(known.has(id(entry.body.payload.restoredHead)));
  }

  return state;
}

async function verifyKeyring(
  source: IChainSource,
  c: ICheckpoint,
  head: ISigned<IManifestHeader>,
  state: IDeviceListState,
) {
  if (head.body.epoch !== c.header.body.epoch) {
    const box = await source.keyring(head.body.keyringHash);
    const key = await source.epochKey(head.body.epoch);
    check(box && key && equal(H("keyring-blob", box), head.body.keyringHash));
    openKeyring(box, key, state.vaultId, state.epoch, state.commits, c.idKey);
  }
}

function priorManifest(
  c: ICheckpoint,
  head: ISigned<IManifestHeader>,
  storedHeaders: readonly ISigned<IManifestHeader>[],
): { kind: "advance" } | { kind: "fork" | "unchanged" | "rollback" } {
  const hash = (h: ISigned<IManifestHeader>) => objectHash(ManifestHeaderCodec, h, "manifest");

  if (head.body.seq <= c.header.body.seq) {
    const stored = storedHeaders.find((h) => h.body.seq === head.body.seq);
    if (!stored || !equal(hash(stored), hash(head))) return { kind: "fork" };

    return { kind: head.body.seq === c.header.body.seq ? "unchanged" : "rollback" };
  }

  return { kind: "advance" };
}
