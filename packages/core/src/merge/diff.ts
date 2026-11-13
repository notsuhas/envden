import { equal } from "./bytes.ts";
import { parseEnv } from "./parser.ts";
import type { TConflict } from "./types.ts";

export function diffEnvKeys(
  before: Uint8Array,
  after: Uint8Array,
): { kind: "diff"; added: string[]; removed: string[]; changed: string[] } | TConflict {
  const a = parseEnv(before);
  const b = parseEnv(after);
  if (a.kind === "conflict") return a;
  if (b.kind === "conflict") return b;
  const old = new Map(a.entries.map((entry) => [entry.key, entry]));
  const next = new Map(b.entries.map((entry) => [entry.key, entry]));

  return {
    kind: "diff",
    added: b.entries.filter((entry) => !old.has(entry.key)).map((entry) => entry.key),
    removed: a.entries.filter((entry) => !next.has(entry.key)).map((entry) => entry.key),
    changed: b.entries
      .filter((entry) => old.has(entry.key) && !equal(old.get(entry.key)?.raw, entry.raw))
      .map((entry) => entry.key),
  };
}
