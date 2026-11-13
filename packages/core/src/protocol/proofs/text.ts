import { requireValue, concat, b32 } from "../encoding/binary.ts";
import { base32, unbase32 } from "../encoding/base32.ts";

export function encodeToken(kind: "setup" | "repair", secret: Uint8Array, pin: Uint8Array): string {
  requireValue(secret.length === 20);

  return "envden-" + kind + "-1:" + base32(concat(secret, b32.write(pin)));
}

export function decodeToken(
  kind: "setup" | "repair",
  text: string,
): { secret: Uint8Array; serverPin: Uint8Array } {
  const prefix = "envden-" + kind + "-1:";
  requireValue(text.startsWith(prefix));
  const data = unbase32(text.slice(prefix.length));
  requireValue(data.length === 52);

  return { secret: data.slice(0, 20), serverPin: data.slice(20) };
}
