import { EnvdenError } from "../../errors/index.ts";
import { requireValue, concat, b32 } from "../encoding/binary.ts";
import { base32, unbase32 } from "../encoding/base32.ts";

type TTokenKind = "setup" | "repair";

const KIND_BYTE: Record<TTokenKind, number> = { setup: 1, repair: 2 };

export function encodeToken(kind: TTokenKind, secret: Uint8Array, pin: Uint8Array): string {
  requireValue(secret.length === 20);

  return base32(concat(Uint8Array.of(KIND_BYTE[kind]), secret, b32.write(pin)));
}

export function isToken(kind: TTokenKind, text: unknown): text is string {
  if (typeof text !== "string") return false;

  const data = tokenBytes(text);

  return data?.length === 53 && data[0] === KIND_BYTE[kind];
}

export function decodeToken(
  kind: TTokenKind,
  text: string,
): { secret: Uint8Array; serverPin: Uint8Array } {
  if (!isToken(kind, text))
    throw new EnvdenError("INVALID_INPUT", `That isn't a ${kind} token. Copy the whole token.`);

  const data = tokenBytes(text)!;

  return { secret: data.slice(1, 21), serverPin: data.slice(21) };
}

// whitespace is dropped so a token wrapped by the terminal still pastes cleanly
function tokenBytes(text: string): Uint8Array | undefined {
  try {
    return unbase32(text.replace(/\s/g, ""));
  } catch {
    return undefined;
  }
}
