import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

// Joins the text drawn by every content stream, decoding pdf-lib's hex strings.
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const parts: string[] = [];

  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;

    const compressed = object.dict.get(PDFName.of("Filter")) !== undefined;
    const content = Buffer.from(compressed ? inflateSync(object.contents) : object.contents);

    for (const [, hex] of content.toString("latin1").matchAll(/<([0-9A-Fa-f]*)> Tj/g))
      parts.push(Buffer.from(hex!, "hex").toString("latin1"));
  }

  return parts.join(" ");
}
