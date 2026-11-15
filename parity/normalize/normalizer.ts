import { createHash } from "node:crypto";

export class Normalizer {
  private readonly values = new Map<string, string>();
  private readonly counts = new Map<string, number>();
  private readonly paths: [string, string][] = [];
  private readonly literals = new Set<string>();

  path(value: string, name: string): void {
    this.paths.push([value, `<PATH:${name}>`]);
    this.paths.sort((a, b) => b[0].length - a[0].length);
  }

  literal(value: string): void {
    this.literals.add(value);
  }

  private symbol(kind: string, value: string, numbering = kind): string {
    const key = `${kind}:${value}`;
    const existing = this.values.get(key);
    if (existing) return existing;
    const next = (this.counts.get(numbering) ?? 0) + 1;
    this.counts.set(numbering, next);
    const result = `<${numbering}#${next}>`;
    this.values.set(key, result);

    return result;
  }

  bytes(value: Uint8Array, scope?: string): string {
    return this.symbol(`BYTES:${value.length}`, Buffer.from(value).toString("hex"), scope);
  }

  text(value: string): string {
    let text = value;
    const protectedValues: string[] = [];
    for (const literal of [...this.literals].sort((a, b) => b.length - a.length)) {
      if (!literal) continue;
      text = text.replaceAll(literal, () => {
        protectedValues.push(literal);
        return `\x00${protectedValues.length - 1}\x00`;
      });
    }
    for (const [path, name] of this.paths)
      text = text.replaceAll(path, () => {
        protectedValues.push(name);
        return `\x00${protectedValues.length - 1}\x00`;
      });
    text = text.replace(
      /("identity"\s*:\s*")([^"]+)(")/g,
      (_, prefix: string, identity: string, suffix: string) =>
        `${prefix}${this.symbol("FSID", identity)}${suffix}`,
    );
    text = text.replace(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/g, (s) => this.symbol("URL", s));
    text = text.replace(/\b\d{4}-\d\d-\d\d[T ][\d:.]+Z?\b/g, "<TIME>");
    text = text.replace(/(?<!\d)1[6-9]\d{11}(?:\.\d+)?(?!\d)/g, "<TIME>");
    text = text.replace(/\b\d{1,3}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, (s) => this.symbol("PAIR", s));
    text = text.replace(/\bEK1-[0-9A-HJKMNP-TV-Z-]+/g, (s) => this.symbol("SECRET", s));
    text = text.replace(
      /(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/gi,
      (s) => this.symbol("UUID", s),
    );
    text = text.replace(
      /(?<![A-Za-z0-9_+-])[A-Za-z0-9_+-]{20,}={0,2}(?![A-Za-z0-9_+-])/g,
      (token) => {
        if (/^\d+$/.test(token)) return token;
        if (/^[0-9a-f]{32,}$/i.test(token) && token.length % 2 === 0)
          return this.bytes(Buffer.from(token, "hex"));
        if (/^[0-9A-HJKMNP-TV-Z]{20,}$/.test(token)) return this.bytes(decode32(token));
        if (
          token.length >= 32 ||
          (token.length === 22 && /[A-Z]/.test(token) && /[a-z]/.test(token))
        )
          return this.bytes(Buffer.from(token, "base64url"));
        return token;
      },
    );
    text = text.replace(/\b\d+(?:\.\d+)?\s?(?:ms|milliseconds?|seconds?)\b/g, "<DURATION>");
    text = text.replace(/(<DURATION> ago \([^\n]*?\)) +/g, "$1 ");
    text = text.replace(/("pid"\s*:\s*)\d+/g, "$1<PID>");

    // oxlint-disable-next-line no-control-regex -- NUL delimits protected fixture and path values.
    return text.replace(/\x00(\d+)\x00/g, (_, n: string) => protectedValues[Number(n)] ?? "");
  }

  hashStructure(value: Uint8Array, scope?: string): string {
    const structure = this.bytes(value, scope);

    return `${structure} sha256:${createHash("sha256").update(structure).digest("hex")}`;
  }
}

function decode32(text: string): Uint8Array {
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of text) {
    buffer = (buffer << 5) | "0123456789ABCDEFGHJKMNPQRSTVWXYZ".indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }

  return Uint8Array.from(bytes);
}
