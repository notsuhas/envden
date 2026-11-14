import type { IReleaseState } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { binary, text } from "../client/encoding.ts";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new EnvdenError("INVALID_DATA", "Invalid stored release state");

  return Object.fromEntries(Object.entries(value));
}

function bytes(value: unknown) {
  if (typeof value !== "string")
    throw new EnvdenError("INVALID_DATA", "Invalid stored release state");

  return binary(value);
}

function counter(value: unknown) {
  if (value === undefined) return undefined;
  const item = record(value);

  if (typeof item.seq !== "string" || !/^\d+$/.test(item.seq))
    throw new EnvdenError("INVALID_DATA", "Invalid stored release state");

  return { seq: BigInt(item.seq), feed: bytes(item.feed) };
}

export function decodeReleaseState(value: unknown): IReleaseState {
  const state = record(value);
  const keys = record(state.keys);
  const primary = bytes(keys.primary);
  const backup = bytes(keys.backup);

  if (
    typeof state.generation !== "number" ||
    !Number.isSafeInteger(state.generation) ||
    state.generation < 1 ||
    primary.length !== 32 ||
    backup.length !== 32 ||
    typeof state.primaryRevoked !== "boolean" ||
    !Array.isArray(state.unsafe) ||
    !state.unsafe.every((item: unknown) => typeof item === "string")
  )
    throw new EnvdenError("INVALID_DATA", "Invalid stored release state");

  return {
    generation: state.generation,
    keys: { primary, backup },
    primary: counter(state.primary),
    backup: counter(state.backup),
    primaryRevoked: state.primaryRevoked,
    unsafe: state.unsafe,
  };
}

export function encodeReleaseState(state: IReleaseState) {
  return JSON.stringify({
    ...state,
    keys: { primary: text(state.keys.primary), backup: text(state.keys.backup) },
    primary: state.primary && { seq: String(state.primary.seq), feed: text(state.primary.feed) },
    backup: state.backup && { seq: String(state.backup.seq), feed: text(state.backup.feed) },
  });
}
