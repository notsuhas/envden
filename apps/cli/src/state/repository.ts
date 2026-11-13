import { withStateLock } from "./lock.ts";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { ILocalState } from "./model.ts";
import { atomicWrite, optionalRead, privateDirectory } from "./files.ts";

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return { $map: [...value] };
  if (value instanceof Set) return { $set: [...value] };
  if (typeof value === "bigint") return { $bigint: String(value) };
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString("base64url") };

  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object") {
    const collection = reviveCollection(value);
    if (collection) return collection;
    if ("$bigint" in value && typeof value.$bigint === "string") return BigInt(value.$bigint);

    if ("$bytes" in value && typeof value.$bytes === "string")
      return new Uint8Array(Buffer.from(value.$bytes, "base64url"));
  }

  return value;
}

export async function saveState(home: string, state: ILocalState): Promise<void> {
  await withStateLock(home, async () => {
    await privateDirectory(home);
    await atomicWrite(join(home, "state", "device.json"), JSON.stringify(state, replacer));
  });
}

export async function loadState(home: string): Promise<ILocalState | undefined> {
  const text = await optionalRead(join(home, "state", "device.json"));
  if (text === undefined) return undefined;

  try {
    const value: ILocalState = JSON.parse(text, reviver);

    if (
      value.format !== 1 ||
      !Array.isArray(value.headers) ||
      !Array.isArray(value.entries) ||
      !Array.isArray(value.approved) ||
      !Array.isArray(value.links) ||
      typeof value.deviceName !== "string"
    )
      throw new Error("Invalid state");

    return value;
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Unreadable local state", { cause });
  }
}

function reviveCollection(value: object) {
  if ("$map" in value && Array.isArray(value.$map)) return new Map(value.$map);
  if ("$set" in value && Array.isArray(value.$set)) return new Set(value.$set);

  return undefined;
}
