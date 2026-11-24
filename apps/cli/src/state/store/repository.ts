import { readUpdateCache } from "../../updates/cache.ts";
import { restorePlacement, clearPlacement } from "../journal/placement.ts";
import { storeHeaders, restoreHeaders } from "./headers.ts";
import { withStateLock } from "../lock/lock.ts";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { aliasMap, type ILocalState } from "../model.ts";
import { atomicWrite, optionalRead, privateDirectory } from "./files.ts";

const OLD_STATE =
  "This envden home is from envden 0.3, whose vaults this version can't open. Back up your env files, remove the envden home and run envden setup again";

const stateKeys = new Set([
  "format",
  "verifiedState",
  "aliasAsked",
  "deviceName",
  "vaultId",
  "creationPending",
  "server",
  "checkpoint",
  "headerRefs",
  "entries",
  "keyring",
  "files",
  "approved",
  "links",
  "aliases",
  "telemetry",
  "updateCheck",
]);

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

export async function saveState(
  home: string,
  state: ILocalState,
  now: () => number,
): Promise<void> {
  await withStateLock(home, async () => {
    await privateDirectory(home);
    const headerRefs = await storeHeaders(home, state.headers, now);
    const { headers: _headers, latest: _latest, ...record } = state;

    await atomicWrite(
      join(home, "state", "device.json"),
      JSON.stringify({ ...record, headerRefs }, replacer),
      now,
    );

    await clearPlacement(home);
  });
}

export async function loadState(home: string): Promise<ILocalState | undefined> {
  const text = await optionalRead(join(home, "state", "device.json"));
  if (text === undefined) return undefined;

  try {
    const value: Omit<ILocalState, "headers"> & { headerRefs: string[] } = JSON.parse(
      text,
      reviver,
    );

    const format: number = value.format;
    if (format === 1) throw new EnvdenError("INVALID_DATA", OLD_STATE);

    if (
      value.format !== 2 ||
      !Array.isArray(value.headerRefs) ||
      !Array.isArray(value.entries) ||
      !Array.isArray(value.approved) ||
      !Array.isArray(value.links) ||
      typeof value.deviceName !== "string" ||
      !value.aliases ||
      typeof value.aliases !== "object" ||
      Array.isArray(value.aliases) ||
      typeof value.telemetry !== "boolean" ||
      typeof value.updateCheck !== "boolean" ||
      Object.keys(value).some((key) => !stateKeys.has(key))
    )
      throw new Error("Invalid state");

    const { headerRefs, ...record } = value;

    const state: ILocalState = {
      ...record,
      aliases: aliasMap(record.aliases),
      headers: await restoreHeaders(home, headerRefs),
    };

    const latest = (await readUpdateCache(home)).latest;
    if (latest) state.latest = latest;
    await restorePlacement(home, state);

    return state;
  } catch (cause) {
    if (cause instanceof EnvdenError) throw cause;

    throw new EnvdenError("INVALID_DATA", "Unreadable local state", { cause });
  }
}

function reviveCollection(value: object) {
  if ("$map" in value && Array.isArray(value.$map)) return new Map(value.$map);
  if ("$set" in value && Array.isArray(value.$set)) return new Set(value.$set);

  return undefined;
}
