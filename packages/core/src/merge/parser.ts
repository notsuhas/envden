import { validateValue } from "./value.ts";
import type { IEnvEntry, TParseResult } from "./types.ts";

const BOM = [0xef, 0xbb, 0xbf];

export function parseEnv(
  bytes: Uint8Array,
  options: { allowDuplicates?: boolean } = {},
): TParseResult {
  const skip = BOM.every((byte, index) => bytes[index] === byte) ? BOM.length : 0;
  const content = bytes.subarray(skip);
  // Latin-1 keeps byte offsets intact, including invalid UTF-8.
  const text = Buffer.from(content).toString("latin1");
  const entries: IEnvEntry[] = [];
  const keys = new Set<string>();
  let offset = 0;
  let start = 0;

  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const body = line.replace(/\r?\n$/, "");
    const match = /^\s*(#\s*)?(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(body);
    offset += line.length;

    if (!match) {
      if (unsupportedLine(body)) return { kind: "conflict", reason: "unsupported-syntax" };

      continue;
    }

    const key = match[3]!;
    const value = match[4]!.trimStart();
    const quote = /^["'`]/.test(value) ? value[0]! : "";

    const validation = validateValue(value, quote, key, text.slice(offset));
    if (validation.kind === "conflict") return validation;

    if (keys.has(key) && !options.allowDuplicates)
      return { kind: "conflict", reason: "duplicate-key", key };

    keys.add(key);

    entries.push({
      key,
      raw: content.slice(start, offset),
      exported: Boolean(match[2]),
      quote,
      active: !match[1],
    });

    start = offset;
  }

  return { kind: "parsed", head: bytes.slice(0, skip), entries, tail: content.slice(start) };
}

function unsupportedLine(body: string) {
  return body.trim() !== "" && !/^\s*#/.test(body);
}
