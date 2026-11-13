import { type ICodec } from "./binary.ts";
import { requireValue, bytes } from "./binary.ts";

function validString(v: string): Uint8Array {
  requireValue(v.normalize("NFC") === v && !/\p{Cc}/u.test(v), "Invalid string");
  const encoded = new TextEncoder().encode(v);

  requireValue(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded) === v,
    "Invalid Unicode",
  );

  return encoded;
}

export const str: ICodec<string> = {
  read: (r) => {
    const v = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.read(r));
    validString(v);

    return v;
  },
  write: (v) => bytes.write(validString(v)),
};

export function ctx(label: string): Uint8Array {
  return str.write("envden/v1/" + label);
}

export function normPw(password: string): string {
  const p = password.normalize("NFKC");
  requireValue(p.length > 0, "Empty password");

  return p;
}
