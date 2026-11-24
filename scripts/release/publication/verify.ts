import { assetName, targets } from "../../../apps/cli/scripts/targets.ts";
import { parseChecksums } from "../channels/render.ts";

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
