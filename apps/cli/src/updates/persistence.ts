import { join } from "node:path";
import { ObjectsResponseSchema, acceptRelease, initialReleaseState } from "@envden/core/protocol";
import type { IReleaseTrust } from "@envden/core/protocol";
import { atomicWrite, optionalRead } from "../state/files.ts";
import { binary, text } from "../client/encoding.ts";

async function releaseHistory(home: string) {
  const saved = await optionalRead(join(home, "state", "releases.json"));

  return saved ? ObjectsResponseSchema.parse(JSON.parse(saved)).objects : [];
}

export async function restoreReleases(home: string, trust: IReleaseTrust | undefined, now: number) {
  if (!trust) return undefined;
  let state = initialReleaseState(trust);

  for (const encoded of await releaseHistory(home)) {
    const result = acceptRelease(binary(encoded), state, BigInt(now));
    if (!result.ok) throw new Error("Invalid stored release history");
    state = result.value.state;
  }

  return state;
}

export async function rememberRelease(home: string, bytes: Uint8Array) {
  const objects = await releaseHistory(home);
  const encoded = text(bytes);
  if (!objects.includes(encoded)) objects.push(encoded);
  await atomicWrite(join(home, "state", "releases.json"), JSON.stringify({ objects }));
}
