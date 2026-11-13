import { join } from "node:path";
import {
  ReleaseCodec,
  ReleaseFeedCodec,
  decodeReleaseFeed,
  Sign,
  Verify,
  parseSemver,
  compareSemver,
} from "@envden/core/protocol";
import { targets, assetName } from "../../apps/cli/scripts/targets.ts";

function hex(value: string | undefined, name: string) {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) throw new Error(`Configure ${name} as 32-byte hex`);

  return new Uint8Array(Buffer.from(value, "hex"));
}

const directory = process.argv[2] ?? "release";
const key = hex(process.env.ENVDEN_RELEASE_PRIMARY_SEED_HEX, "ENVDEN_RELEASE_PRIMARY_SEED_HEX");

const publicKey = hex(
  process.env.ENVDEN_RELEASE_PRIMARY_PUBLIC_HEX,
  "ENVDEN_RELEASE_PRIMARY_PUBLIC_HEX",
);

const generationText = process.env.ENVDEN_RELEASE_GENERATION;

if (!generationText || !/^[1-9][0-9]*$/.test(generationText))
  throw new Error("Configure ENVDEN_RELEASE_GENERATION");

const generation = Number(generationText);

if (!Number.isSafeInteger(generation) || generation > 0xffffffff)
  throw new Error("Invalid generation");

const previousPath = process.env.ENVDEN_PREVIOUS_FEED;

const previous = previousPath
  ? decodeReleaseFeed(new Uint8Array(await Bun.file(previousPath).arrayBuffer()))
  : undefined;

if (previous) {
  const signature = previous.signatures.find((entry) => entry.key === 0);
  if (
    previous.body.generation !== generation ||
    !signature ||
    !Verify(publicKey, "release", ReleaseCodec.write(previous.body), signature.sig).ok
  )
    throw new Error("Previous feed is not signed by the configured primary");
  if (previous.body.revokePrimary || previous.body.next)
    throw new Error("Offline backup procedure required");
}

if (!previous && process.env.ENVDEN_FIRST_RELEASE !== "1")
  throw new Error("Previous feed required; first release must be explicit");

const latest = process.env.ENVDEN_RELEASE_VERSION;

if (!latest) throw new Error("ENVDEN_RELEASE_VERSION required");

parseSemver(latest);

if (previous && compareSemver(latest, previous.body.latest) < 0)
  throw new Error("Release version must not go backwards");

const unsafe = [
  ...new Set([
    ...(previous?.body.unsafe ?? []),
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

if (previous && latest === previous.body.latest) {
  for (const build of builds) {
    const old = previous.body.builds.find((item) => item.platform === build.platform);
    if (!old || !Buffer.from(old.sha256).equals(Buffer.from(build.sha256)))
      throw new Error("Refusing to re-sign changed release assets");
  }
}

const issuedAt = BigInt(Date.now());

const body = {
  generation,
  seq: (previous?.body.seq ?? 0n) + 1n,
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
