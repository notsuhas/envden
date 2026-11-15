import { EnvdenError } from "../errors/index.ts";

export function parseSha256Sums(contents: string): Map<string, string> {
  const hashes = new Map<string, string>();

  for (const line of contents.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) [ *](\S+)$/i.exec(line);
    const hash = match?.[1];
    const name = match?.[2];

    if (!hash || !name) throw new EnvdenError("INVALID_DATA", "Invalid SHA256SUMS entry");
    if (hashes.has(name)) throw new EnvdenError("INVALID_DATA", "Duplicate SHA256SUMS entry");

    hashes.set(name, hash.toLowerCase());
  }

  return hashes;
}
