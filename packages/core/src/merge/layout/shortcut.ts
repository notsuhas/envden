import { equal } from "../bytes.ts";
import { entryBytes } from "../entries/bytes.ts";
import { parseEnv } from "../parser.ts";
import type { TMergeResult } from "../types.ts";

export function shortcut(base: Uint8Array, chosen: Uint8Array): TMergeResult {
  const before = parseEnv(base);
  const after = parseEnv(chosen);
  const changedKeys: string[] = [];

  if (before.kind === "parsed" && after.kind === "parsed") {
    const b = new Map(before.entries.map((entry) => [entry.key, entry]));
    const a = new Map(after.entries.map((entry) => [entry.key, entry]));

    for (const key of new Set([...b.keys(), ...a.keys()]))
      if (!equal(entryBytes(b.get(key)), entryBytes(a.get(key)))) changedKeys.push(key);
  }

  return { kind: "clean", bytes: chosen.slice(), changedKeys };
}
