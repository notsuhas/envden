import { parseEnv } from "../parser.ts";
import type { IEnvEntry } from "../types.ts";

type TSide = IEnvEntry | undefined;

export function parseSides(base: Uint8Array, local: Uint8Array, remote: Uint8Array) {
  const b = parseEnv(base);
  if (b.kind === "conflict") return b;
  const l = parseEnv(local);
  if (l.kind === "conflict") return l;
  const r = parseEnv(remote);
  if (r.kind === "conflict") return r;

  const maps = [b, l, r].map((file) => new Map(file.entries.map((entry) => [entry.key, entry])));
  const keys = new Set(maps.flatMap((map) => [...map.keys()]));

  const sides = new Map(
    [...keys].map((key) => [key, maps.map((map) => map.get(key)) as [TSide, TSide, TSide]]),
  );

  return { kind: "parsed" as const, files: { base: b, local: l, remote: r }, sides };
}
