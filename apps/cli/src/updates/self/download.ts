import { compareSemver, sha256 } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TFetch } from "../../client/fetch.ts";
import { latestRelease, releaseAssetUrl } from "../github.ts";

export async function downloadUpdate(
  fetcher: TFetch,
  running: string,
  platform: string,
  timeoutMs = 1800000,
) {
  const latest = await latestRelease(fetcher);

  if (compareSemver(latest, running) <= 0) return { kind: "current" as const };

  const name = `envden-${platform}${platform.startsWith("windows-") ? ".exe" : ""}`;

  const sums = await fetcher(releaseAssetUrl(latest, "SHA256SUMS"), {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!sums.ok) throw new EnvdenError("INVALID_DATA", "Release checksums download failed");
  const hashes = new Map<string, string>();

  for (const line of (await sums.text()).trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) [ *](\S+)$/i.exec(line);

    if (!match?.[1] || !match[2] || hashes.has(match[2]))
      throw new EnvdenError("INVALID_DATA", "Invalid release checksums");

    hashes.set(match[2], match[1].toLowerCase());
  }

  const hash = hashes.get(name);
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
