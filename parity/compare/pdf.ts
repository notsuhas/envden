import { pdfObjects } from "./pdf/objects.ts";
import { pdfInfo } from "./pdf/info.ts";

export function pdfContent(bytes: Uint8Array): { text: string[]; info: Record<string, string> } {
  const source = Buffer.from(bytes).toString("latin1");
  if (!source.startsWith("%PDF-")) throw new Error("Invalid PDF header");
  const { objects, text } = pdfObjects(source);

  return { text, info: pdfInfo(source, objects) };
}
