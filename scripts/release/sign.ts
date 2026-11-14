import { join } from "node:path";
import {
  ReleaseCodec,
  ReleaseFeedCodec,
  Sign,
  Verify,
  parseSemver,
  compareSemver,
} from "@envden/core/protocol";
import { releaseConfig } from "@envden/cli/src/updates/release-config.ts";
import { verifiedFeed, nextSequence, checkBuilds } from "./feed-policy.ts";
import { targets, assetName } from "../../apps/cli/scripts/targets.ts";

function hex(value: string | undefined, name: string) {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) throw new Error(`Configure ${name} as 32-byte hex`);

  return new Uint8Array(Buffer.from(value, "hex"));
}

const directory = process.argv[2] ?? "release";
const key = hex(process.env.ENVDEN_RELEASE_PRIMARY_SEED_HEX, "ENVDEN_RELEASE_PRIMARY_SEED_HEX");

const trust = releaseConfig.trust;

if (!trust) throw new Error("CLI release trust required");

const generation = trust.generation;
const publicKey = trust.keys.primary;
const latest = process.env.ENVDEN_RELEASE_VERSION;

if (!latest) throw new Error("ENVDEN_RELEASE_VERSION required");

parseSemver(latest);

async function publishedFeed(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("Could not read published feed");

  return verifiedFeed(new Uint8Array(await response.arrayBuffer()), trust!);
}

const base = "https://github.com/notsuhas/envden/releases";
const published = await publishedFeed(`${base}/latest/download/release-g${generation}.bin`);
const tagged = await publishedFeed(`${base}/download/v${latest}/release-g${generation}.bin`);
const previousPath = process.env.ENVDEN_PREVIOUS_FEED;

const local = previousPath
  ? verifiedFeed(new Uint8Array(await Bun.file(previousPath).arrayBuffer()), trust)
  : undefined;

const feeds = [published, tagged, local].filter((feed) => feed !== undefined);

if (!published && process.env.ENVDEN_FIRST_RELEASE !== "1")
  throw new Error("Published feed required; first release must be explicit");

const seq = nextSequence(feeds, process.env.ENVDEN_FIRST_RELEASE === "1");
const previous = feeds.toSorted((a, b) => (a.seq > b.seq ? -1 : a.seq < b.seq ? 1 : 0))[0];

if (previous && compareSemver(latest, previous.latest) < 0)
  throw new Error("Release version must not go backwards");

const unsafe = [
  ...new Set([
    ...feeds.flatMap((feed) => feed.unsafe),
    ...(process.env.ENVDEN_UNSAFE_VERSIONS?.split(",").filter(Boolean) ?? []),
  ]),
].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const builds = await Promise.all(
  targets.map(async (platform) => ({
    platform,
    sha256: new Bun.CryptoHasher("sha256")
      .update(await Bun.file(join(directory, assetName(platform))).arrayBuffer())
      .digest(),
  })),
);

builds.sort((a, b) => (a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0));

checkBuilds(latest, builds, feeds);

const issuedAt = BigInt(Date.now());

const body = {
  generation,
  seq,
  issuedAt,
  expires: issuedAt + 2592000000n,
  latest,
  unsafe,
  builds,
  revokePrimary: 0,
  next: undefined,
};

const sig = Sign(key, "release", ReleaseCodec.write(body));

if (!Verify(publicKey, "release", ReleaseCodec.write(body), sig).ok)
  throw new Error("Signing key does not match public key");

const feed = ReleaseFeedCodec.write({ body, signatures: [{ key: 0, sig }] });

await Bun.write(join(directory, `release-g${generation}.bin`), feed);

await Bun.write(join(directory, "release.bin"), feed);
