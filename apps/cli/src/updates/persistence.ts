import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { binary } from "../client/encoding.ts";
import { releaseConfig } from "./release-config.ts";
import { decodeReleaseState, encodeReleaseState } from "./trust.ts";

export async function restoreReleases(
  home: string,
  trust: p.IReleaseTrust | undefined,
  now: number,
) {
  if (!trust) return undefined;
  const saved = await optionalRead(join(home, "state", "releases.json"));
  if (!saved) return p.initialReleaseState(trust);

  try {
    const value: unknown = JSON.parse(saved);
    const legacy = p.ObjectsResponseSchema.safeParse(value);
    if (!legacy.success) return p.initialReleaseState(trust, decodeReleaseState(value));
    let state = p.initialReleaseState(trust);

    for (const encoded of legacy.data.objects) {
      const bytes = binary(encoded);
      const feed = p.decode(p.ReleaseFeedCodec, bytes);

      if (feed.body.generation < trust.generation) {
        state.unsafe = [...new Set([...state.unsafe, ...feed.body.unsafe])];
        continue;
      }

      const result = p.acceptRelease(bytes, state, BigInt(now));
      if (!result.ok) throw new EnvdenError("INVALID_DATA", "Invalid stored release history");
      state = result.value.state;
    }

    await atomicWrite(join(home, "state", "releases.json"), encodeReleaseState(state));

    return state;
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid stored release history", { cause });
  }
}

export async function rememberRelease(home: string, bytes: Uint8Array, accepted?: p.IReleaseState) {
  let state = accepted;

  if (!state) {
    const stored = await restoreReleases(home, releaseConfig.trust, 0);
    if (!stored) throw new EnvdenError("INVALID_DATA", "Missing release trust");
    const result = p.acceptRelease(bytes, stored, 0n);
    if (!result.ok) throw new EnvdenError("INVALID_DATA", "Invalid stored release history");
    state = result.value.state;
  }

  await atomicWrite(join(home, "state", "releases.json"), encodeReleaseState(state));
}
