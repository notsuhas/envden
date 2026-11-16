export function literalString(text: string, start: number): { value: string; end: number } {
  let depth = 1;
  let value = "";
  let i = start + 1;

  while (i < text.length && depth) {
    const next = text[i++]!;

    if (next === "\\") {
      const escaped = escapeSequence(text, i);
      i = escaped.end;
      value += escaped.value;
    } else if (next === "(") {
      depth++;
      value += next;
    } else if (next === ")") {
      depth--;
      if (depth) value += next;
    } else value += next;
  }

  if (depth) throw new Error("Unterminated PDF string");

  return { value: decodeString(Buffer.from(value, "latin1")), end: i };
}

function escapeSequence(text: string, start: number): { value: string; end: number } {
  const escaped = text[start]!;
  let end = start + 1;
  const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };

  if (/[0-7]/.test(escaped)) {
    const octal = escaped + (text.slice(end).match(/^[0-7]{0,2}/)?.[0] ?? "");
    end += octal.length - 1;

    return { value: String.fromCharCode(parseInt(octal, 8)), end };
  }

  if (escaped === "\r") {
    if (text[end] === "\n") end++;

    return { value: "", end };
  }

  return { value: escaped === "\n" ? "" : (escapes[escaped] ?? escaped), end };
}

export function hexString(text: string, start: number): { value: string; end: number } {
  const end = text.indexOf(">", start);
  if (end < 0) throw new Error("Unterminated PDF hex string");
  let hex = text.slice(start + 1, end).replace(/\s/g, "");
  if (hex.length % 2) hex += "0";

  return { value: decodeString(Buffer.from(hex, "hex")), end: end + 1 };
}

function decodeString(bytes: Buffer): string {
  if (bytes[0] === 254 && bytes[1] === 255) {
    let result = "";

    for (let i = 2; i + 1 < bytes.length; i += 2)
      result += String.fromCharCode(bytes.readUInt16BE(i));

    return result;
  }

  return bytes.toString("latin1");
}
