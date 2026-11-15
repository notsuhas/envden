import { EnvdenError } from "@envden/core/errors";
import { AsyncLocalStorage } from "node:async_hooks";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { compareSemver } from "@envden/core/protocol";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { readUpdateCache } from "./cache.ts";
import { VERSION } from "../version.ts";

export async function updateStatus(home: string) {
  const cache = await readUpdateCache(home);

  return {
    available: !!cache.latest && compareSemver(cache.latest, VERSION) > 0,
    required: (await optionalRead(join(home, "state", "update-required"))) === VERSION,
    ...(cache.message ? { message: cache.message } : {}),
  };
}

export async function recordUpdateRequired(home: string, error: unknown, now: () => number) {
  if (
    error instanceof EnvdenError &&
    error.message === "The server requires a version that doesn't exist"
  )
    return;

  return atomicWrite(join(home, "state", "update-required"), VERSION, now);
}

const requestHome = new AsyncLocalStorage<string>();

export function withUpdateStatus<T>(home: string, action: () => Promise<T>) {
  return requestHome.run(home, action);
}

export async function authenticatedRequestSucceeded() {
  const home = requestHome.getStore();
  if (home) await rm(join(home, "state", "update-required"), { force: true });
}
