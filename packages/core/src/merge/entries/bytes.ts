import type { IEnvEntry } from "../types.ts";

export function entryBytes(entry: IEnvEntry | undefined): Uint8Array | undefined {
  const raw = entry?.raw;
  if (!raw?.length || raw[raw.length - 1] !== 10) return raw;
  const end = raw.length - (raw[raw.length - 2] === 13 ? 2 : 1);

  return raw.subarray(0, end);
}
