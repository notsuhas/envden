import { commentsMovedApart } from "./layout/comments.ts";
import { lineEnding, withLineEnding } from "./layout/line-ending.ts";
import { shortcut } from "./layout/shortcut.ts";
import { selectEntry } from "./selection.ts";
import { equal } from "./bytes.ts";
import { parseEnv } from "./parser.ts";
import type { IEnvEntry, TMergeResult, TParseResult } from "./types.ts";

export function mergeEnv(base: Uint8Array, local: Uint8Array, remote: Uint8Array): TMergeResult {
  if (equal(base, local)) return shortcut(base, remote);
  if (equal(base, remote) || equal(local, remote)) return shortcut(base, local);

  const parsedBase = parseEnv(base);
  const parsedLocal = parseEnv(local);
  const parsedRemote = parseEnv(remote);
  if (parsedBase.kind === "conflict") return parsedBase;
  if (parsedLocal.kind === "conflict") return parsedLocal;
  if (parsedRemote.kind === "conflict") return parsedRemote;
  const b = new Map(parsedBase.entries.map((entry) => [entry.key, entry]));
  const l = new Map(parsedLocal.entries.map((entry) => [entry.key, entry]));
  const r = new Map(parsedRemote.entries.map((entry) => [entry.key, entry]));
  const selected = new Map<string, IEnvEntry>();
  const changedKeys: string[] = [];

  for (const key of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
    const result = selectEntry(key, b.get(key), l.get(key), r.get(key));
    if (result.kind === "conflict") return result;
    if (result.changed) changedKeys.push(key);
    if (result.entry) selected.set(key, result.entry);
  }

  if (commentsMovedApart(parsedBase.entries, parsedLocal.entries, parsedRemote.entries))
    return { kind: "conflict", reason: "layout-change" };

  if (tailChanged(parsedBase.tail, parsedLocal.tail, parsedRemote.tail))
    return { kind: "conflict", reason: "layout-change" };

  return {
    kind: "clean",
    bytes: mergeLayout(
      { base: parsedBase, local: parsedLocal, remote: parsedRemote },
      selected,
      lineEnding(local, base, remote),
    ),
    changedKeys,
  };
}

type TParsed = Extract<TParseResult, { kind: "parsed" }>;

function mergeLayout(
  files: { base: TParsed; local: TParsed; remote: TParsed },
  selected: Map<string, IEnvEntry>,
  ending: string,
) {
  const { base, local, remote } = files;
  const known = new Set([...base.entries, ...local.entries].map((entry) => entry.key));
  const parts: Uint8Array[] = [];

  for (const entry of local.entries) {
    const chosen = selected.get(entry.key);

    if (chosen)
      appendPart(parts, chosen === entry ? chosen.raw : withLineEnding(chosen.raw, ending), ending);
  }

  appendPart(parts, local.tail, ending);

  for (const entry of remote.entries)
    if (!known.has(entry.key)) appendPart(parts, withLineEnding(entry.raw, ending), ending);

  const head = equal(base.head, local.head) ? remote.head : local.head;

  return Buffer.concat([head, ...parts]);
}

function appendPart(parts: Uint8Array[], part: Uint8Array, ending: string) {
  if (!part.length) return;
  const previous = parts.at(-1);
  if (previous?.length && previous[previous.length - 1] !== 10) parts.push(Buffer.from(ending));
  parts.push(part);
}

function tailChanged(base: Uint8Array, local: Uint8Array, remote: Uint8Array) {
  if (base.length && !equal(base, local) && !equal(base, remote)) return true;

  return !equal(base, remote) && !equal(local, remote);
}
