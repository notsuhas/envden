import { stripVTControlCharacters } from "node:util";

const rules = [
  { kind: "secret", pattern: /\bEK1-(?:[0-9A-Z]{5}-){5}[0-9A-Z]{4}\b/g },
  { kind: "uuid", pattern: /\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi },
  { kind: "id", pattern: /(?<![\w-])[0-9A-HJKMNP-TV-Z]{26}(?![\w-])/g },
  { kind: "time", pattern: /\b\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z\b/g },
  { kind: "time", pattern: /\b1[7-9]\d{11}(?:\.\d+)?\b/g },
  { kind: "pair", pattern: /\b\d{1,3}-[0-9A-Z]{4}-[0-9A-Z]{4}\b/g },
  { kind: "hex", pattern: /(?<![\w-])[0-9a-f]{32,}(?![\w-])/gi },
  { kind: "token", pattern: /(?<![\w-])[0-9A-Z]{40,}(?![\w-])/g },
  { kind: "encoded", pattern: /(?<![\w-])[A-Za-z0-9_-]{32,}={0,2}(?![\w-])/g },
];

export class Normalizer {
  private values = new Map<string, Map<string, string>>();

  private root: string;
  private executables: string[];

  constructor(root: string, executables: string[] = []) {
    this.root = root;
    this.executables = executables;
  }

  text(value: string): string {
    let text = stripVTControlCharacters(value)
      .replaceAll(`/private${this.root}`, "<ROOT>")
      .replaceAll(this.root, "<ROOT>");

    for (const path of this.executables) text = text.replaceAll(path, "<EXECUTABLE>");

    text = text.replace(/(?<=envden Recovery Kit )[0-9A-Z]{6}(?=\.pdf)/g, (match) =>
      this.map("kit-suffix", match),
    );

    text = text
      .replace(/\b\d+ (?:seconds?|minutes?|hours?|days?) ago\b/g, "<RELATIVE_TIME>")
      .replace(/\b\d{4}-\d\d-\d\d \d\d:\d\d GMT[+-]\d{1,2}(?::\d\d)?\b/g, "<TIME>");

    text = text.replace(/(<RELATIVE_TIME> \(<TIME>\)) +/g, "$1  ");

    text = text.replace(/(?:127\.0\.0\.1|localhost):\d+/g, (match) => this.map("address", match));

    for (const rule of rules)
      text = text.replace(rule.pattern, (match) =>
        rule.kind === "time" ? "<TIME>" : this.map(rule.kind, match),
      );

    return text;
  }

  known(value: string): string {
    for (const values of this.values.values())
      for (const [raw, mapped] of values) value = value.replaceAll(raw, mapped);

    return value;
  }

  map(kind: string, value: string): string {
    let values = this.values.get(kind);

    if (!values) {
      values = new Map();
      this.values.set(kind, values);
    }

    let mapped = values.get(value);

    if (!mapped) {
      mapped = `<${kind}:${values.size + 1}:${value.length}>`;
      values.set(value, mapped);
    }

    return mapped;
  }

  private string(value: string, key: string) {
    if (key === "identity") return "<FS_IDENTITY>";
    if (key === "$bytes") return this.map("binary", value);

    if (
      /cipher|signature|opaque|envelope|wrap|nonce|private|public|hash|digest|pin|record|key/i.test(
        key,
      ) &&
      /^[\w+/=-]{32,}$/.test(value)
    )
      return this.map("crypto", value);

    return this.text(value);
  }

  value(value: unknown, key = ""): unknown {
    if (value instanceof Uint8Array) {
      const identity = /^(vault|id|device|hash|head|digest|list|file|key|blob)$/.test(key);

      return {
        bytes: value.length,
        ...(identity ? { identity: this.map("bytes-id", Buffer.from(value).toString("hex")) } : {}),
      };
    }

    if (typeof value === "string") return this.string(value, key);

    if (typeof value === "number" && value > 1_700_000_000_000) return "<TIME>";
    if (Array.isArray(value)) return value.map((item) => this.value(item, key));

    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, item]) => [this.text(name), this.value(item, fieldName(name))]),
      );

    return value;
  }
}

// random tokens used as object keys must not be read as field names like "key" or "pin"
function fieldName(name: string): string {
  return /^[\w+/=-]{32,}$/.test(name) ? "" : name;
}
