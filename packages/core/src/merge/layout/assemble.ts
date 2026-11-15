import { equal } from "../bytes.ts";
import { withLineEnding } from "./line-ending.ts";
import { commentsMovedApart } from "./comments.ts";
import type { IEnvEntry, TParseResult } from "../types.ts";

export type TParsed = Extract<TParseResult, { kind: "parsed" }>;

export function assembleLayout(
  files: { base: TParsed; local: TParsed; remote: TParsed },
  selected: Map<string, IEnvEntry>,
  ending: string,
  blocks: ReadonlyMap<string, Uint8Array> = new Map(),
) {
  const { base, local, remote } = files;
  const known = new Set([...base.entries, ...local.entries].map((entry) => entry.key));
  const parts: Uint8Array[] = [];

  for (const entry of local.entries) {
    const chosen = blocks.get(entry.key) ?? selected.get(entry.key)?.raw;

    if (chosen)
      appendPart(parts, chosen === entry.raw ? chosen : withLineEnding(chosen, ending), ending);
  }

  appendPart(parts, local.tail, ending);

  for (const entry of remote.entries)
    if (!known.has(entry.key)) appendPart(parts, withLineEnding(entry.raw, ending), ending);

  const placed = new Set(local.entries.map((entry) => entry.key));

  for (const [key, block] of blocks) if (!placed.has(key)) appendPart(parts, block, ending);

  const head = equal(base.head, local.head) ? remote.head : local.head;

  return Buffer.concat([head, ...parts]);
}

export function layoutChanged(files: { base: TParsed; local: TParsed; remote: TParsed }) {
  const { base, local, remote } = files;

  return (
    commentsMovedApart(base.entries, local.entries, remote.entries) ||
    tailChanged(base.tail, local.tail, remote.tail)
  );
}

function tailChanged(base: Uint8Array, local: Uint8Array, remote: Uint8Array) {
  if (base.length && !equal(base, local) && !equal(base, remote)) return true;

  return !equal(base, remote) && !equal(local, remote);
}

function appendPart(parts: Uint8Array[], part: Uint8Array, ending: string) {
  if (!part.length) return;
  const previous = parts.at(-1);
  if (previous?.length && previous[previous.length - 1] !== 10) parts.push(Buffer.from(ending));
  parts.push(part);
}
