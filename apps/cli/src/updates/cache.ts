import { join } from "node:path";
import { parseSemver } from "@envden/core/protocol";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import type { IUpdateCache } from "./check.ts";

export async function readUpdateCache(home: string): Promise<IUpdateCache> {
  try {
    const value: unknown = JSON.parse(
      (await optionalRead(join(home, "state", "updates.json"))) ?? "{}",
    );

    if (!value || typeof value !== "object") return {};
    const cache: IUpdateCache = {};

    if ("checkedAt" in value && typeof value.checkedAt === "number")
      cache.checkedAt = value.checkedAt;

    if ("message" in value && typeof value.message === "string") cache.message = value.message;

    if ("latest" in value && typeof value.latest === "string") {
      parseSemver(value.latest);
      cache.latest = value.latest;
    }

    return cache;
  } catch {
    return {};
  }
}

export function saveUpdateCache(home: string, cache: IUpdateCache) {
  return atomicWrite(join(home, "state", "updates.json"), JSON.stringify(cache));
}
