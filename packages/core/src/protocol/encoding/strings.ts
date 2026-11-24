import { EnvdenError } from "../../errors/envden-error.ts";
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
    const v = decodeString(bytes.read(r));
    validString(v);

    return v;
  },
  write: (v) => bytes.write(validString(v)),
};

export function ctx(label: string): Uint8Array {
  return str.write("envden/v2/" + label);
}

function decodeString(data: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid Unicode", { cause });
  }
}
