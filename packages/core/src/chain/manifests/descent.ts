import { EntryCodec, ManifestHeaderCodec, equal, objectHash } from "../../protocol/index.ts";
import type { IManifestHeader, ISigned, TEntry } from "../../protocol/index.ts";
import { check } from "../shared/validation.ts";
import type { IChainSource } from "./source.ts";

export async function headerDescent(
  source: Pick<IChainSource, "header">,
  ancestor: ISigned<IManifestHeader>,
  head: ISigned<IManifestHeader>,
  verifyDivergent: (header: ISigned<IManifestHeader>) => Promise<void>,
): Promise<ISigned<IManifestHeader>[] | undefined> {
  const path: ISigned<IManifestHeader>[] = [];
  let current = head;

  while (current.body.seq > ancestor.body.seq) {
    path.push(current);
    const previous = await source.header(current.body.prev);

    check(
      previous && equal(objectHash(ManifestHeaderCodec, previous, "manifest"), current.body.prev),
    );

    check(previous.body.seq + 1n === current.body.seq);
    current = previous;
  }

  if (
    !equal(
      objectHash(ManifestHeaderCodec, current, "manifest"),
      objectHash(ManifestHeaderCodec, ancestor, "manifest"),
    )
  ) {
    await verifyDivergent(current);
    for (const header of path) await verifyDivergent(header);

    return undefined;
  }

  return path.reverse();
}

export async function entryDescent(
  source: Pick<IChainSource, "entry">,
  ancestor: { seq: bigint; head: Uint8Array },
  target: { listSeq: bigint; listHead: Uint8Array },
): Promise<ISigned<TEntry>[]> {
  const path: ISigned<TEntry>[] = [];
  let hash = target.listHead;
  let seq = target.listSeq;
  check(seq >= ancestor.seq);

  while (seq > ancestor.seq) {
    const entry = await source.entry(hash);
    check(entry && entry.body.seq === seq && equal(objectHash(EntryCodec, entry, "entry"), hash));
    path.push(entry);
    hash = entry.body.parent;
    seq -= 1n;
  }

  check(equal(hash, ancestor.head));

  return path.reverse();
}
