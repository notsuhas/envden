import { selectEntry } from "./selection.ts";
import { equal } from "./bytes.ts";
import { parseEnv } from "./parser.ts";
import type { IEnvEntry, TMergeResult, TParseResult } from "./types.ts";

export function mergeEnv(base: Uint8Array, local: Uint8Array, remote: Uint8Array): TMergeResult {
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

  if (equal(base, local)) return { kind: "clean", bytes: remote.slice(), changedKeys };
  if (equal(base, remote)) return { kind: "clean", bytes: local.slice(), changedKeys };

  if (!equal(parsedBase.tail, parsedRemote.tail) && !equal(parsedLocal.tail, parsedRemote.tail))
    return { kind: "conflict", reason: "layout-change" };

  return {
    kind: "clean",
    bytes: mergeLayout(parsedLocal, parsedRemote, l, b, selected),
    changedKeys,
  };
}

function mergeLayout(
  parsedLocal: Extract<TParseResult, { kind: "parsed" }>,
  parsedRemote: Extract<TParseResult, { kind: "parsed" }>,
  l: Map<string, IEnvEntry>,
  b: Map<string, IEnvEntry>,
  selected: Map<string, IEnvEntry>,
) {
  const parts: Uint8Array[] = [];

  for (const entry of parsedLocal.entries) {
    const chosen = selected.get(entry.key);
    if (chosen) parts.push(chosen.raw);
  }

  parts.push(parsedLocal.tail);

  for (const entry of parsedRemote.entries) {
    if (!l.has(entry.key) && !b.has(entry.key)) {
      const previous = parts.findLast((part) => part.length > 0);
      if (previous?.length && previous[previous.length - 1] !== 10) parts.push(Buffer.from("\n"));
      parts.push(entry.raw);
    }
  }

  return Buffer.concat(parts);
}
