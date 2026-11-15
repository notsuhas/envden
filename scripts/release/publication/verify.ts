import { assetName, targets } from "../../../apps/cli/scripts/targets.ts";
import { z } from "zod";
import { parseChecksums } from "../channels/render.ts";

const pinnedSchema = z.record(z.enum(targets), z.string());

export function verifyReleaseChecksums(
  published: string,
  rebuilt: string,
  macosSigned: boolean,
): void {
  const expected = parseChecksums(published);
  const actual = parseChecksums(rebuilt);

  if (
    comparedTargets(macosSigned).some(
      (target) => expected.get(assetName(target)) !== actual.get(assetName(target)),
    )
  )
    throw new Error(
      "Published tag was rebuilt with different binaries. Re-run only failed jobs from the original run; release a new version for changed binaries. Published assets cannot be replaced.",
    );
}

// Timestamped Developer ID signatures differ on every signing, so signed macOS rebuilds never match.
function comparedTargets(macosSigned: boolean) {
  return macosSigned ? targets.filter((target) => !target.startsWith("darwin-")) : targets;
}

export function verifyNpmChecksums(pinned: unknown, published: string): void {
  const hashes = parseChecksums(published);

  const parsed = pinnedSchema.safeParse(pinned);

  if (
    !parsed.success ||
    targets.some((target) => parsed.data[target] !== hashes.get(assetName(target)))
  )
    throw new Error(
      "Published npm package checksums differ from the published release; release a new version.",
    );
}
