import { inflateSync } from "node:zlib";
import type { Normalizer } from "../normalize.ts";

export function pdfText(bytes: Buffer, n: Normalizer) {
  const source = bytes.toString("latin1");
  const streams: string[] = [];

  for (const match of source.matchAll(/<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gs)) {
    const raw = Buffer.from(match[2]!, "latin1");

    const decoded = /FlateDecode/.test(match[1]!)
      ? inflateSync(raw).toString("latin1")
      : raw.toString("latin1");

    for (const text of decoded.matchAll(/<([0-9a-f]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/gi)) {
      streams.push(text[1] ? Buffer.from(text[1], "hex").toString("utf8") : text[2]!);
    }
  }

  if (!streams.length) throw new Error("PDF has no decoded text operators");

  return { pdfText: n.text(streams.join("\n")) };
}
