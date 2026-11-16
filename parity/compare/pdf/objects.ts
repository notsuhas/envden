import { inflateSync } from "node:zlib";
import { pdfTokens } from "../pdf-strings.ts";
import { shownText } from "./text.ts";

export function pdfObjects(source: string): { objects: Map<string, string>; text: string[] } {
  const objects = new Map<string, string>();
  const text: string[] = [];
  const object = /(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = object.exec(source))) {
    const end = source.indexOf("endobj", object.lastIndex);
    if (end < 0) throw new Error("Unterminated PDF object");
    const body = source.slice(object.lastIndex, end);
    objects.set(`${match[1]} ${match[2]}`, body);
    const stream = /\bstream\r?\n/.exec(body);

    if (stream) {
      const parsed = readStream(source, body, object.lastIndex, stream);
      text.push(...parsed.text);
      object.lastIndex = parsed.end;
    } else object.lastIndex = end + 6;
  }

  return { objects, text };
}

function readStream(source: string, body: string, offset: number, stream: RegExpExecArray) {
  const start = offset + stream.index + stream[0].length;
  const dictionary = body.slice(0, stream.index);
  const length = /\/Length\s+(\d+)\s*(?!\d)(?!\s+\d+\s+R)/.exec(dictionary)?.[1];
  const streamEnd = length ? start + Number(length) : source.indexOf("endstream", start);
  if (streamEnd < 0) throw new Error("Unterminated PDF stream");
  const content = decodeStream(source.slice(start, streamEnd), dictionary);
  const text = streamText(content, dictionary);
  const objectEnd = source.indexOf("endobj", streamEnd);
  if (objectEnd < 0) throw new Error("Unterminated PDF stream object");

  return { text, end: objectEnd + 6 };
}

function decodeStream(source: string, dictionary: string): string {
  let content = Buffer.from(source, "latin1");

  if (/\/FlateDecode\b/.test(dictionary)) content = inflateSync(content);
  else if (/\/Filter\b/.test(dictionary)) throw new Error("Unsupported PDF stream filter");

  return content.toString("latin1");
}

function streamText(content: string, dictionary: string): string[] {
  if (!/\/Subtype\s*\/Image\b/.test(dictionary) && /\b(?:Tj|TJ)\b/.test(content))
    return shownText(pdfTokens(content));

  return [];
}
