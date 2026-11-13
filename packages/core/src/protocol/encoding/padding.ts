import { type ICodec } from "./binary.ts";
import { concat, requireValue, Reader } from "./binary.ts";

export function pad(data: Uint8Array): Uint8Array {
  return concat(data, new Uint8Array((256 - (data.length % 256)) % 256));
}

export function decodePadded<T>(c: ICodec<T>, data: Uint8Array): T {
  requireValue(data.length % 256 === 0, "Invalid padded length");
  const r = new Reader(data);
  const v = c.read(r);
  const rest = r.take(data.length - r.offset);
  requireValue(rest.length < 256 && rest.every((b) => b === 0), "Invalid padding");

  return v;
}
