import { parseSemver } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TFetch } from "../client/fetch.ts";

export const RELEASE_REPOSITORY = "notsuhas/envden";

export function releaseAssetUrl(version: string, name: string) {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/download/v${version}/${name}`;
}

function tagVersion(tag: unknown) {
  if (typeof tag !== "string" || !tag.startsWith("v"))
    throw new EnvdenError("INVALID_DATA", "Invalid release tag");

  try {
    parseSemver(tag.slice(1));
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid release tag", { cause });
  }

  return tag.slice(1);
}

export async function latestRelease(fetcher: TFetch) {
  try {
    const response = await fetcher(`https://github.com/${RELEASE_REPOSITORY}/releases/latest`, {
      redirect: "manual",
      signal: AbortSignal.timeout(2000),
    });

    const location = response.headers.get("location");

    if (response.status >= 300 && response.status < 400 && location) {
      const url = new URL(location, "https://github.com");
      const prefix = `/${RELEASE_REPOSITORY}/releases/tag/`;

      if (url.origin === "https://github.com" && url.pathname.startsWith(prefix))
        return tagVersion(url.pathname.slice(prefix.length));
    }
  } catch {
    // The API is a fallback when the public redirect is unavailable.
  }

  const response = await fetcher(
    `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`,
    {
      signal: AbortSignal.timeout(2000),
      redirect: "error",
    },
  );

  if (!response.ok) throw new EnvdenError("INVALID_DATA", "Latest release lookup failed");
  const value: unknown = await response.json();

  if (!value || typeof value !== "object" || !("tag_name" in value))
    throw new EnvdenError("INVALID_DATA", "Invalid release response");

  return tagVersion(value.tag_name);
}
