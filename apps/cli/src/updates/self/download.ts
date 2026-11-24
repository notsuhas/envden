import { milliseconds } from "date-fns";
import { compareSemver, sha256 } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { parseSha256Sums } from "@envden/core/release";
import type { TFetch } from "../../client/fetch.ts";
import { latestRelease, releaseAssetUrl } from "../github.ts";

export async function downloadUpdate(
  fetcher: TFetch,
  running: string,
  platform: string,
  timeoutMs = milliseconds({ minutes: 30 }),
) {
  const latest = await latestRelease(fetcher);

  if (compareSemver(latest, running) <= 0) return { kind: "current" as const };

  const name = `envden-${platform}`;

  const sums = await fetcher(releaseAssetUrl(latest, "SHA256SUMS"), {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!sums.ok) throw new EnvdenError("INVALID_DATA", "Release checksums download failed");

  const hash = parseSha256Sums(await sums.text()).get(name);
  if (!hash) throw new EnvdenError("INVALID_DATA", "No release build for this platform");

  const response = await fetcher(releaseAssetUrl(latest, name), {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new EnvdenError("INVALID_DATA", "Build download failed");
  const bytes = new Uint8Array(await response.arrayBuffer());

  if (Buffer.from(sha256(bytes)).toString("hex") !== hash)
    throw new EnvdenError("INVALID_DATA", "Build checksum mismatch");

  return bytes;
}
