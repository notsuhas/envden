import { equal } from "../encoding/binary.ts";
import { compareSemver } from "../versions/semver.ts";
import { sha256 } from "../crypto/hash.ts";

import { type TVerification } from "../crypto/sign.ts";

import { type IRelease } from "../codecs/releases/body.ts";

export function selfUpdateDecision(
  release: IRelease,
  running: string,
  platform: string,
  unsafe: readonly string[],
  now: bigint,
  download: Uint8Array,
): TVerification<string> {
  if (now >= release.expires) return { ok: false, reason: "Expired release" };
  if (compareSemver(release.latest, running) <= 0) return { ok: false, reason: "Not newer" };

  if (unsafe.includes(release.latest) || release.unsafe.includes(release.latest))
    return { ok: false, reason: "Unsafe version" };

  const build = release.builds.find((b) => b.platform === platform);

  if (!build || !equal(sha256(download), build.sha256))
    return { ok: false, reason: "Build hash mismatch" };

  return { ok: true, value: release.latest };
}
