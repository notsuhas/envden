import { decodeReleaseFeed, ReleaseCodec, Verify } from "@envden/core/protocol";
import type { IReleaseTrust } from "@envden/core/protocol";

export function verifiedFeed(bytes: Uint8Array, trust: IReleaseTrust) {
  const feed = decodeReleaseFeed(bytes);
  const signature = feed.signatures.find((entry) => entry.key === 0);

  if (
    feed.body.generation !== trust.generation ||
    !signature ||
    !Verify(trust.keys.primary, "release", ReleaseCodec.write(feed.body), signature.sig).ok
  )
    throw new Error("Feed is not signed by the built-in primary");

  if (feed.body.revokePrimary || feed.body.next)
    throw new Error("Offline backup procedure required");

  return feed.body;
}

export function nextSequence(feeds: ReturnType<typeof verifiedFeed>[], firstRelease: boolean) {
  if (!feeds.length && !firstRelease)
    throw new Error("Published feed required; first release must be explicit");

  return feeds.reduce((seq, feed) => (feed.seq > seq ? feed.seq : seq), 0n) + 1n;
}

export function checkBuilds(
  latest: string,
  builds: ReturnType<typeof verifiedFeed>["builds"],
  feeds: ReturnType<typeof verifiedFeed>[],
) {
  for (const feed of feeds.filter((item) => item.latest === latest)) {
    if (
      feed.builds.length !== builds.length ||
      builds.some((build) => {
        const old = feed.builds.find((item) => item.platform === build.platform);

        return !old || !Buffer.from(old.sha256).equals(Buffer.from(build.sha256));
      })
    )
      throw new Error("Refusing to re-sign changed release assets");
  }
}
